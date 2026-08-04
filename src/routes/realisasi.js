import { ruteAman } from '../lib/rute.js';
import { q, transaksi } from '../lib/db.js';
import { wajibLogin, wajibPeran, tolakSuperAdmin } from '../lib/auth.js';
import { bebankanPembayaran, lepasSisaKunci, setelTerpakai, totalDibayar } from '../lib/realisasi.js';
import { ambilPengaturan } from '../lib/snapshot.js';
import { beriTahu } from '../lib/notifikasi.js';

export const rute = ruteAman();
rute.use(wajibLogin, tolakSuperAdmin);

const rp = (n) => 'Rp ' + Math.round(Number(n)).toLocaleString('id-ID');

// ---------------------------------------------------------------- pembayaran

/**
 * Mencatat pembayaran. Boleh bertahap.
 *
 * Batas atas keras: total pembayaran tidak pernah boleh melebihi nominal
 * disetujui, untuk semua jenis penerima, tanpa pengecualian. Yang berbahaya di
 * sistem anggaran adalah pembayaran yang lebih besar dari yang disetujui - yang
 * lebih kecil ditangani lewat penutupan atau LPJ.
 */
rute.post('/:id/bayar', wajibPeran('finance'), async (req, res) => {
  const b = req.body ?? {};
  if (!(Number(b.nominal) > 0)) return res.status(400).json({ pesan: 'Nominal pembayaran harus lebih dari nol.' });
  if (!b.tanggal || !b.metode) return res.status(400).json({ pesan: 'Tanggal dan metode pembayaran wajib diisi.' });

  const hasil = await transaksi(async (c) => {
    const { rows } = await c.query('SELECT * FROM pengajuan WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!rows.length) return { kode: 404, pesan: 'Pengajuan tidak ditemukan.' };
    const p = rows[0];
    if (!['menunggu_realisasi', 'realisasi_sebagian'].includes(p.status))
      return { kode: 409, pesan: 'Pengajuan ini belum disetujui penuh atau sudah selesai.' };

    const sudah = await totalDibayar(c, p.id);
    const sisa = Number(p.total_nominal) - sudah;
    if (Number(b.nominal) > sisa + 0.005)
      return {
        kode: 422,
        pesan: `Melebihi sisa yang belum dibayar. Disetujui ${rp(p.total_nominal)}, sudah dibayar ${rp(sudah)}, sisa ${rp(sisa)}.`,
      };

    await c.query(
      `INSERT INTO pembayaran (pengajuan_id, tanggal, nominal, metode, no_referensi, dicatat_oleh)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [p.id, b.tanggal, b.nominal, b.metode, b.no_referensi ?? null, req.pengguna.id],
    );
    await bebankanPembayaran(c, p.id, b.nominal);

    const totalBaru = sudah + Number(b.nominal);
    const lunas = Math.round(totalBaru * 100) >= Math.round(Number(p.total_nominal) * 100);
    const statusBaru = lunas ? 'selesai' : 'realisasi_sebagian';

    await c.query(
      `UPDATE pengajuan SET status = $1, selesai_pada = CASE WHEN $2 THEN now() ELSE selesai_pada END WHERE id = $3`,
      [statusBaru, lunas, p.id],
    );
    await c.query(
      `INSERT INTO pengajuan_log (pengajuan_id, versi_no, status_dari, status_ke, aksi, oleh, alasan)
       VALUES ($1,$2,$3,$4,'bayar',$5,$6)`,
      [p.id, p.versi_no, p.status, statusBaru, req.pengguna.id, `${rp(b.nominal)} via ${b.metode}`],
    );
    await beriTahu(c, {
      pengguna_id: p.dibuat_oleh, pengajuan_id: p.id, jenis: 'pembayaran',
      judul: `${p.nomor} dibayar ${rp(b.nominal)}`,
      isi: lunas ? 'Pembayaran lunas. LPJ sudah dapat diisi setelah program selesai.' : `Sisa ${rp(sisa - Number(b.nominal))}.`,
    });

    return { ok: true, status: statusBaru, sudah_dibayar: totalBaru, sisa: Number(p.total_nominal) - totalBaru };
  });

  if (!hasil.ok) return res.status(hasil.kode).json({ pesan: hasil.pesan });
  res.json({ pesan: hasil.status === 'selesai' ? 'Pembayaran lunas.' : 'Pembayaran sebagian tercatat.', ...hasil });
});

/**
 * Menutup pengajuan yang dibayar di bawah nominal disetujui.
 *
 * Hanya untuk penerima vendor. Finance membayar berdasarkan invoice - kalau
 * invoice lebih kecil, uang perusahaan tidak boleh keluar melebihi dasarnya.
 * Selisihnya dilepas kembali ke pagu.
 *
 * Untuk reimburse dan kas, jalurnya berbeda: dibayar penuh, sisanya kembali
 * lewat setoran di LPJ. Uangnya dipegang orang internal, jadi masih bisa ditarik.
 */
rute.post('/:id/tutup', wajibPeran('finance'), async (req, res) => {
  const hasil = await transaksi(async (c) => {
    const { rows } = await c.query(
      `SELECT p.*, pn.jenis AS jenis_penerima FROM pengajuan p
         LEFT JOIN penerima pn ON pn.id = p.penerima_id WHERE p.id = $1 FOR UPDATE OF p`,
      [req.params.id],
    );
    if (!rows.length) return { kode: 404, pesan: 'Pengajuan tidak ditemukan.' };
    const p = rows[0];
    if (!['menunggu_realisasi', 'realisasi_sebagian'].includes(p.status))
      return { kode: 409, pesan: 'Hanya pengajuan yang sedang direalisasi yang dapat ditutup.' };
    if (p.jenis_penerima !== 'vendor')
      return {
        kode: 409,
        pesan: 'Penutupan di bawah nominal hanya untuk penerima vendor. Reimburse dan kas dibayar penuh, sisanya kembali lewat setoran di LPJ.',
      };

    const sudah = await totalDibayar(c, p.id);
    if (sudah <= 0) return { kode: 422, pesan: 'Belum ada pembayaran yang tercatat.' };

    const selisih = Number(p.total_nominal) - sudah;
    const p0 = await ambilPengaturan();
    const ambang = Math.min(
      Number(p.total_nominal) * (p0.ambang_penutupan_persen ?? 0.1),
      p0.ambang_penutupan_rupiah ?? 500000,
    );
    // Selisih kecil karena pembulatan atau ongkos kirim tidak perlu birokrasi.
    if (selisih > ambang && !req.body?.alasan)
      return {
        kode: 422,
        pesan: `Selisih ${rp(selisih)} melewati ambang ${rp(ambang)}, sehingga alasan penutupan wajib diisi.`,
        selisih, ambang,
      };

    await lepasSisaKunci(c, p.id);
    await c.query(
      `UPDATE pengajuan SET status = 'selesai', selesai_pada = now(), ditutup_pada = now(),
              ditutup_oleh = $1, alasan_penutupan = $2 WHERE id = $3`,
      [req.pengguna.id, req.body?.alasan ?? null, p.id],
    );
    await c.query(
      `INSERT INTO pengajuan_log (pengajuan_id, versi_no, status_dari, status_ke, aksi, oleh, alasan)
       VALUES ($1,$2,$3,'selesai','tutup_pembayaran',$4,$5)`,
      [p.id, p.versi_no, p.status, req.pengguna.id,
       `Ditutup di ${rp(sudah)} dari ${rp(p.total_nominal)}. ${req.body?.alasan ?? ''}`.trim()],
    );
    return { ok: true, dibayar: sudah, dilepas: selisih };
  });

  if (!hasil.ok) return res.status(hasil.kode).json({ pesan: hasil.pesan, ...hasil });
  res.json({ pesan: `Pengajuan ditutup. ${rp(hasil.dilepas)} dilepas kembali ke pagu.`, ...hasil });
});

rute.get('/:id/pembayaran', async (req, res) => {
  const { rows } = await q(
    `SELECT b.*, u.nama AS dicatat_oleh_nama FROM pembayaran b
       JOIN pengguna u ON u.id = b.dicatat_oleh
      WHERE b.pengajuan_id = $1 ORDER BY b.tanggal, b.id`,
    [req.params.id],
  );
  res.json(rows);
});
