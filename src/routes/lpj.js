import { ruteAman } from '../lib/rute.js';
import { q, transaksi } from '../lib/db.js';
import { wajibLogin, wajibPeran, tolakSuperAdmin } from '../lib/auth.js';
import { setelTerpakai, totalDibayar } from '../lib/realisasi.js';
import { beriTahu } from '../lib/notifikasi.js';

export const rute = ruteAman();
rute.use(wajibLogin, tolakSuperAdmin);

const rp = (n) => 'Rp ' + Math.round(Number(n)).toLocaleString('id-ID');

rute.get('/:id', async (req, res) => {
  const { rows } = await q(
    `SELECT l.*, COALESCE((SELECT json_agg(json_build_object(
              'pengajuan_item_id', li.pengajuan_item_id, 'nama', i.nama,
              'qty_rencana', i.qty, 'harga_rencana', i.harga_satuan, 'subtotal_rencana', i.subtotal,
              'qty_aktual', li.qty_aktual, 'harga_aktual', li.harga_aktual,
              'subtotal_aktual', li.subtotal_aktual, 'selisih', i.subtotal - li.subtotal_aktual)
              ORDER BY i.urutan, i.id)
            FROM lpj_item li JOIN pengajuan_item i ON i.id = li.pengajuan_item_id
           WHERE li.lpj_id = l.id), '[]') AS item
       FROM lpj l WHERE l.pengajuan_id = $1`,
    [req.params.id],
  );
  if (!rows.length) return res.status(404).json({ pesan: 'LPJ belum dibuat untuk pengajuan ini.' });
  res.json(rows[0]);
});

/**
 * Mengirim LPJ.
 *
 * Kolom realisasi di layar terisi otomatis dengan angka rencana; Admin hanya
 * mengubah baris yang berbeda. Kalau setiap LPJ menuntut pengetikan ulang, orang
 * akan menundanya - dan blokir pengajuan baru berubah dari alat kontrol jadi
 * sumber keluhan.
 *
 * Untuk penerima vendor, sisa selalu nol: uangnya sudah keluar sesuai invoice
 * dan tidak ada mekanisme menariknya kembali dari pihak luar. Yang
 * dipertanggungjawabkan adalah pelaksanaan programnya.
 */
rute.post('/:id', wajibPeran('admin'), async (req, res) => {
  const item = Array.isArray(req.body?.item) ? req.body.item : [];

  const hasil = await transaksi(async (c) => {
    const { rows } = await c.query(
      `SELECT p.*, pn.jenis AS jenis_penerima FROM pengajuan p
         LEFT JOIN penerima pn ON pn.id = p.penerima_id WHERE p.id = $1 FOR UPDATE OF p`,
      [req.params.id],
    );
    if (!rows.length) return { kode: 404, pesan: 'Pengajuan tidak ditemukan.' };
    const p = rows[0];
    if (p.status !== 'selesai') return { kode: 409, pesan: 'LPJ baru bisa diisi setelah pembayaran selesai.' };
    if (p.status_lpj === 'disetujui') return { kode: 409, pesan: 'LPJ sudah disetujui dan tidak dapat diubah.' };
    if (p.status_lpj === 'menunggu_verifikasi') return { kode: 409, pesan: 'LPJ sedang menunggu verifikasi Finance.' };
    if (new Date(p.tgl_selesai) > new Date())
      return { kode: 409, pesan: `Program belum selesai. LPJ dapat diisi setelah ${p.tgl_selesai}.` };

    const { rows: rencana } = await c.query('SELECT id, subtotal FROM pengajuan_item WHERE pengajuan_id = $1', [p.id]);
    const sah = new Set(rencana.map((r) => String(r.id)));
    for (const x of item)
      if (!sah.has(String(x.pengajuan_item_id)))
        return { kode: 400, pesan: `Item ${x.pengajuan_item_id} bukan bagian dari pengajuan ini.` };

    const dibayar = await totalDibayar(c, p.id);
    const terpakaiItem = item.reduce((s, x) => s + Number(x.qty_aktual || 0) * Number(x.harga_aktual || 0), 0);

    // Vendor: uang sudah keluar sesuai invoice, jadi terpakai sama dengan dibayar
    // dan sisa selalu nol. Rincian aktual tetap dicatat sebagai bukti pelaksanaan.
    const vendor = p.jenis_penerima === 'vendor';
    const totalTerpakai = vendor ? dibayar : Math.min(terpakaiItem, dibayar);
    const sisaDana = vendor ? 0 : dibayar - totalTerpakai;

    if (!vendor && sisaDana > 0 && !req.body?.bukti_setor)
      return { kode: 422, pesan: `Sisa dana ${rp(sisaDana)} wajib disetorkan kembali. Lampirkan bukti setornya.`, sisa: sisaDana };

    const { rows: l } = await c.query(
      `INSERT INTO lpj (pengajuan_id, status, total_terpakai, sisa_dana, catatan, disubmit_pada, dibuat_oleh)
       VALUES ($1,'menunggu_verifikasi',$2,$3,$4,now(),$5)
       ON CONFLICT (pengajuan_id) DO UPDATE
          SET status = 'menunggu_verifikasi', total_terpakai = EXCLUDED.total_terpakai,
              sisa_dana = EXCLUDED.sisa_dana, catatan = EXCLUDED.catatan, disubmit_pada = now()
       RETURNING id`,
      [p.id, totalTerpakai, sisaDana, req.body?.catatan ?? null, req.pengguna.id],
    );
    const lpjId = l[0].id;

    await c.query('DELETE FROM lpj_item WHERE lpj_id = $1', [lpjId]);
    for (const x of item)
      await c.query(
        'INSERT INTO lpj_item (lpj_id, pengajuan_item_id, qty_aktual, harga_aktual, catatan) VALUES ($1,$2,$3,$4,$5)',
        [lpjId, x.pengajuan_item_id, x.qty_aktual ?? 0, x.harga_aktual ?? 0, x.catatan ?? null],
      );

    await c.query("UPDATE pengajuan SET status_lpj = 'menunggu_verifikasi' WHERE id = $1", [p.id]);
    await c.query(
      `INSERT INTO pengajuan_log (pengajuan_id, versi_no, status_dari, status_ke, aksi, oleh, alasan)
       VALUES ($1,$2,'selesai','selesai','lpj_submit',$3,$4)`,
      [p.id, p.versi_no, req.pengguna.id, `Terpakai ${rp(totalTerpakai)}, sisa ${rp(sisaDana)}`],
    );
    await beriTahu(c, {
      peran: 'finance', pengajuan_id: p.id, jenis: 'lpj_verifikasi',
      judul: `LPJ ${p.nomor} menunggu verifikasi`,
      isi: `Terpakai ${rp(totalTerpakai)} dari ${rp(dibayar)} yang dibayar.`,
    });

    return { ok: true, lpj_id: lpjId, total_terpakai: totalTerpakai, sisa_dana: sisaDana, dibayar };
  });

  if (!hasil.ok) return res.status(hasil.kode).json(hasil);
  res.json({ pesan: 'LPJ terkirim dan menunggu verifikasi Finance.', ...hasil });
});

/**
 * Verifikasi LPJ oleh Finance. Hanya Approve dan Revisi - tanpa Reject.
 *
 * LPJ yang salah harus diperbaiki sampai benar, bukan ditolak lalu hilang,
 * karena uangnya sudah terlanjur keluar.
 *
 * Saat disetujui, angka terpakai berubah dari nominal dibayar menjadi nominal
 * yang benar-benar terpakai, dan sisanya dilepas kembali ke pagu region.
 */
rute.post('/:id/verifikasi', wajibPeran('finance'), async (req, res) => {
  const aksi = req.body?.aksi;
  if (!['approve', 'revisi'].includes(aksi))
    return res.status(400).json({ pesan: 'Aksi harus approve atau revisi. LPJ tidak dapat ditolak.' });
  if (aksi === 'revisi' && !req.body?.alasan)
    return res.status(400).json({ pesan: 'Alasan wajib diisi untuk revisi.' });

  const hasil = await transaksi(async (c) => {
    const { rows } = await c.query(
      `SELECT l.*, p.nomor, p.versi_no, p.dibuat_oleh FROM lpj l JOIN pengajuan p ON p.id = l.pengajuan_id
        WHERE l.pengajuan_id = $1 AND l.status = 'menunggu_verifikasi' FOR UPDATE OF l`,
      [req.params.id],
    );
    if (!rows.length) return { kode: 404, pesan: 'Tidak ada LPJ yang menunggu verifikasi untuk pengajuan ini.' };
    const l = rows[0];

    if (aksi === 'revisi') {
      await c.query("UPDATE lpj SET status = 'perlu_revisi' WHERE id = $1", [l.id]);
      await c.query("UPDATE pengajuan SET status_lpj = 'perlu_revisi' WHERE id = $1", [l.pengajuan_id]);
      await beriTahu(c, {
        pengguna_id: l.dibuat_oleh, pengajuan_id: l.pengajuan_id, jenis: 'lpj_revisi',
        judul: `LPJ ${l.nomor} perlu revisi`, isi: req.body.alasan,
      });
    } else {
      await setelTerpakai(c, l.pengajuan_id, l.total_terpakai);
      await c.query(
        "UPDATE lpj SET status = 'disetujui', diverifikasi_oleh = $1, diverifikasi_pada = now() WHERE id = $2",
        [req.pengguna.id, l.id],
      );
      await c.query("UPDATE pengajuan SET status_lpj = 'disetujui' WHERE id = $1", [l.pengajuan_id]);
      await beriTahu(c, {
        pengguna_id: l.dibuat_oleh, pengajuan_id: l.pengajuan_id, jenis: 'lpj_disetujui',
        judul: `LPJ ${l.nomor} disetujui`,
        isi: Number(l.sisa_dana) > 0 ? `${rp(l.sisa_dana)} dilepas kembali ke pagu.` : null,
      });
    }

    await c.query(
      `INSERT INTO pengajuan_log (pengajuan_id, versi_no, status_dari, status_ke, aksi, oleh, alasan)
       VALUES ($1,$2,'selesai','selesai',$3,$4,$5)`,
      [l.pengajuan_id, l.versi_no, aksi === 'approve' ? 'lpj_approve' : 'lpj_revisi',
       req.pengguna.id, req.body?.alasan ?? `Terpakai final ${rp(l.total_terpakai)}`],
    );
    return { ok: true, status: aksi === 'approve' ? 'disetujui' : 'perlu_revisi' };
  });

  if (!hasil.ok) return res.status(hasil.kode).json({ pesan: hasil.pesan });
  res.json({ pesan: hasil.status === 'disetujui' ? 'LPJ disetujui. Angka terpakai final dan sisa pagu dilepas.' : 'LPJ dikembalikan untuk diperbaiki.', ...hasil });
});

// Daftar LPJ menunggak. Kontrol paling murah dan paling ampuh - konsekuensinya
// langsung terasa oleh yang menunda, bukan lewat pengingat berulang.
rute.get('/', async (req, res) => {
  const { rows } = await q(
    `SELECT p.id, p.nomor, p.judul, k.nama AS kota, r.nama AS region, p.status_lpj, p.batas_lpj,
            (CURRENT_DATE - p.batas_lpj) AS telat_hari, p.total_nominal
       FROM pengajuan p
       JOIN kota k ON k.id = p.kota_id
       JOIN area a ON a.id = k.area_id
       JOIN region r ON r.id = a.region_id
      WHERE p.batas_lpj IS NOT NULL
        AND ($1::text IS NULL OR p.status_lpj::text = $1)
        AND ($2::boolean IS NOT TRUE OR (p.batas_lpj < CURRENT_DATE
             AND p.status_lpj IN ('belum_dibuat','draft','perlu_revisi')))
      ORDER BY p.batas_lpj`,
    [req.query.status ?? null, req.query.menunggak === '1'],
  );
  res.json(rows);
});
