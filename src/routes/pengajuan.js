import { ruteAman } from '../lib/rute.js';
import { q, transaksi } from '../lib/db.js';
import { wajibLogin, wajibPeran, peranEfektif, tolakSuperAdmin } from '../lib/auth.js';
import { periksaPagu, kunciPagu, lepasPagu } from '../lib/pagu.js';
import { hitungSnapshot } from '../lib/snapshot.js';
import { PEMEGANG, setelahApprove } from '../lib/status.js';
import { beriTahu } from '../lib/notifikasi.js';

export const rute = ruteAman();
rute.use(wajibLogin, tolakSuperAdmin);

const uang = (v) => Number(v ?? 0);

// Formulir HTML mengirim field yang tidak diisi sebagai teks kosong, bukan null.
// PostgreSQL menolak teks kosong untuk kolom angka dan tanggal, dan galatnya
// muncul sebagai kesalahan server yang tidak menjelaskan apa-apa ke pengguna.
const nol = (v) => (v === '' || v === undefined ? null : v);

async function nomorBaru(c, tahun, bulan) {
  const { rows } = await c.query(
    `SELECT COALESCE(max(substring(nomor from 13)::int), 0) + 1 AS n
       FROM pengajuan WHERE nomor LIKE $1`,
    [`BR/${tahun}/${String(bulan).padStart(2, '0')}/%`],
  );
  return `BR/${tahun}/${String(bulan).padStart(2, '0')}/${String(rows[0].n).padStart(4, '0')}`;
}

const isiPengajuan = async (id) => {
  const { rows } = await q(
    `SELECT p.*, k.nama AS kota, a.nama AS area, r.nama AS region, kb.nama AS kategori,
            pn.nama AS penerima, pn.jenis AS jenis_penerima,
            EXTRACT(day FROM now() - COALESCE(
              (SELECT max(waktu) FROM pengajuan_log l WHERE l.pengajuan_id = p.id), p.dibuat_pada))::int AS umur_hari,
            COALESCE((SELECT json_agg(i ORDER BY i.urutan, i.id) FROM pengajuan_item i WHERE i.pengajuan_id = p.id), '[]') AS item,
            COALESCE((SELECT json_agg(json_build_object('waktu', l.waktu, 'aksi', l.aksi, 'dari', l.status_dari,
                       'ke', l.status_ke, 'oleh', u.nama, 'atas_nama', un.nama, 'alasan', l.alasan, 'versi', l.versi_no)
                       ORDER BY l.waktu) FROM pengajuan_log l
                       LEFT JOIN pengguna u  ON u.id  = l.oleh
                       LEFT JOIN pengguna un ON un.id = l.atas_nama
                      WHERE l.pengajuan_id = p.id), '[]') AS riwayat
       FROM pengajuan p
       JOIN kota k ON k.id = p.kota_id
       JOIN area a ON a.id = p.area_id
       JOIN region r ON r.id = p.region_id
       JOIN kategori_budget kb ON kb.id = p.kategori_id
       LEFT JOIN penerima pn ON pn.id = p.penerima_id
      WHERE p.id = $1`,
    [id],
  );
  return rows[0] ?? null;
};

// ---------------------------------------------------------------- daftar & detail

rute.get('/', async (req, res) => {
  const peran = await peranEfektif(req.pengguna.id, req.pengguna.peran);
  const statusSaya = peran.map((p) => Object.entries(PEMEGANG).find(([, v]) => v === p.peran)?.[0]).filter(Boolean);

  const { rows } = await q(
    `SELECT p.id, p.nomor, p.versi_no, p.status, p.judul, p.total_nominal, p.melebihi_pagu, p.jalur_cepat,
            p.minta_pembatalan, p.periode_tahun, p.periode_bulan,
            k.nama AS kota, r.nama AS region, kb.nama AS kategori,
            EXTRACT(day FROM now() - COALESCE(
              (SELECT max(waktu) FROM pengajuan_log l WHERE l.pengajuan_id = p.id), p.dibuat_pada))::int AS umur_hari
       FROM pengajuan p
       JOIN kota k ON k.id = p.kota_id
       JOIN region r ON r.id = p.region_id
       JOIN kategori_budget kb ON kb.id = p.kategori_id
      WHERE ($1::text IS NULL OR p.status::text = $1)
        AND ($2::boolean IS NOT TRUE OR p.status::text = ANY($3::text[]))
      ORDER BY p.status, umur_hari DESC, p.id DESC
      LIMIT 200`,
    [req.query.status ?? null, req.query.antrean === '1', statusSaya],
  );
  res.json(rows);
});

rute.get('/:id', async (req, res) => {
  const p = await isiPengajuan(req.params.id);
  if (!p) return res.status(404).json({ pesan: 'Pengajuan tidak ditemukan.' });
  res.json(p);
});

// ---------------------------------------------------------------- draft oleh Admin

rute.post('/', wajibPeran('admin'), async (req, res) => {
  const b = req.body ?? {};
  const wajib = ['kota_id', 'kategori_id', 'periode_tahun', 'periode_bulan', 'judul', 'tgl_mulai', 'tgl_selesai'];
  const kurang = wajib.filter((f) => !b[f]);
  if (kurang.length) return res.status(400).json({ pesan: `Field wajib belum diisi: ${kurang.join(', ')}.` });

  const { rows: w } = await q(
    `SELECT k.id AS kota_id, a.id AS area_id, r.id AS region_id
       FROM kota k JOIN area a ON a.id = k.area_id JOIN region r ON r.id = a.region_id
      WHERE k.id = $1 AND k.aktif`,
    [b.kota_id],
  );
  if (!w.length) return res.status(400).json({ pesan: 'Kota tidak ditemukan atau tidak aktif.' });

  const { rows } = await q(
    `INSERT INTO pengajuan (nomor, status, kota_id, area_id, region_id, kategori_id,
                            periode_tahun, periode_bulan, judul, tujuan, tgl_mulai, tgl_selesai,
                            lokasi, penerima_id, tgl_dibutuhkan, dibuat_oleh)
     VALUES ($1,'draft',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [
      `DRAFT-${Date.now()}`, w[0].kota_id, w[0].area_id, w[0].region_id, b.kategori_id,
      b.periode_tahun, b.periode_bulan, b.judul, nol(b.tujuan), b.tgl_mulai, b.tgl_selesai,
      nol(b.lokasi), nol(b.penerima_id), nol(b.tgl_dibutuhkan), req.pengguna.id,
    ],
  );
  res.status(201).json(await isiPengajuan(rows[0].id));
});

// Total dihitung dari rincian, tidak pernah diketik. Efek sampingnya: LPJ nanti
// bisa membandingkan rencana dan realisasi per item, bukan cuma totalnya.
rute.put('/:id/item', wajibPeran('admin'), async (req, res) => {
  const item = Array.isArray(req.body?.item) ? req.body.item : null;
  if (!item?.length) return res.status(400).json({ pesan: 'Minimal satu baris rincian item.' });
  for (const [i, x] of item.entries()) {
    if (!x.nama) return res.status(400).json({ pesan: `Baris ${i + 1}: nama item wajib diisi.` });
    if (!(Number(x.qty) > 0)) return res.status(400).json({ pesan: `Baris ${i + 1}: qty harus lebih dari nol.` });
    if (!(Number(x.harga_satuan) > 0)) return res.status(400).json({ pesan: `Baris ${i + 1}: harga satuan harus lebih dari nol.` });
  }

  const hasil = await transaksi(async (c) => {
    const { rows } = await c.query("SELECT status FROM pengajuan WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!rows.length) return { kode: 404, pesan: 'Pengajuan tidak ditemukan.' };
    if (!['draft', 'perlu_revisi'].includes(rows[0].status))
      return { kode: 409, pesan: 'Rincian hanya bisa diubah saat draft atau perlu revisi.' };

    await c.query('DELETE FROM pengajuan_item WHERE pengajuan_id = $1', [req.params.id]);
    for (const [i, x] of item.entries())
      await c.query(
        'INSERT INTO pengajuan_item (pengajuan_id, urutan, nama, qty, satuan, harga_satuan) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.params.id, i, x.nama, x.qty, x.satuan ?? null, x.harga_satuan],
      );
    await c.query(
      'UPDATE pengajuan SET total_nominal = (SELECT COALESCE(sum(subtotal),0) FROM pengajuan_item WHERE pengajuan_id = $1) WHERE id = $1',
      [req.params.id],
    );
    return null;
  });
  if (hasil) return res.status(hasil.kode).json({ pesan: hasil.pesan });
  res.json(await isiPengajuan(req.params.id));
});

// Menyunting draft. Tanpa ini, satu salah ketik memaksa membuat pengajuan baru
// dari nol - dan Admin akan meninggalkan draft menggantung di daftar.
rute.patch('/:id', wajibPeran('admin'), async (req, res) => {
  const b = req.body ?? {};
  const { rows: ada } = await q('SELECT status FROM pengajuan WHERE id = $1', [req.params.id]);
  if (!ada.length) return res.status(404).json({ pesan: 'Pengajuan tidak ditemukan.' });
  if (!['draft', 'perlu_revisi'].includes(ada[0].status))
    return res.status(409).json({ pesan: 'Pengajuan hanya bisa diubah saat draft atau perlu revisi.' });

  let wilayah = null;
  if (b.kota_id) {
    const { rows } = await q(
      `SELECT k.id AS kota_id, a.id AS area_id, r.id AS region_id
         FROM kota k JOIN area a ON a.id = k.area_id JOIN region r ON r.id = a.region_id
        WHERE k.id = $1 AND k.aktif`, [b.kota_id]);
    if (!rows.length) return res.status(400).json({ pesan: 'Kota tidak ditemukan atau tidak aktif.' });
    wilayah = rows[0];
  }

  await q(
    `UPDATE pengajuan SET
        kota_id = COALESCE($1, kota_id), area_id = COALESCE($2, area_id), region_id = COALESCE($3, region_id),
        kategori_id = COALESCE($4, kategori_id), periode_tahun = COALESCE($5, periode_tahun),
        periode_bulan = COALESCE($6, periode_bulan), judul = COALESCE($7, judul), tujuan = COALESCE($8, tujuan),
        tgl_mulai = COALESCE($9, tgl_mulai), tgl_selesai = COALESCE($10, tgl_selesai),
        lokasi = COALESCE($11, lokasi), penerima_id = COALESCE($12, penerima_id),
        tgl_dibutuhkan = COALESCE($13, tgl_dibutuhkan)
      WHERE id = $14`,
    [wilayah?.kota_id ?? null, wilayah?.area_id ?? null, wilayah?.region_id ?? null,
     nol(b.kategori_id), nol(b.periode_tahun), nol(b.periode_bulan), nol(b.judul), nol(b.tujuan),
     nol(b.tgl_mulai), nol(b.tgl_selesai), nol(b.lokasi), nol(b.penerima_id), nol(b.tgl_dibutuhkan),
     req.params.id],
  );
  res.json(await isiPengajuan(req.params.id));
});

// Panel sisa pagu dan cost ratio sebelum submit, supaya Admin melihat angkanya
// lebih dulu - bukan setelah ditolak tiga tahap kemudian.
rute.get('/:id/pratinjau', async (req, res) => {
  const p = await isiPengajuan(req.params.id);
  if (!p) return res.status(404).json({ pesan: 'Pengajuan tidak ditemukan.' });
  const cek = await periksaPagu(null, {
    area_id: p.area_id, region_id: p.region_id, kategori_id: p.kategori_id,
    tahun: p.periode_tahun, bulan: p.periode_bulan, nominal: p.total_nominal,
  });
  const snap = await hitungSnapshot(null, {
    kota_id: p.kota_id, periode_tahun: p.periode_tahun, periode_bulan: p.periode_bulan,
    nominal: p.total_nominal, pengajuan_id: p.id,
  });
  res.json({ pagu: cek, konteks: snap });
});

// ---------------------------------------------------------------- submit

/**
 * Mengirim pengajuan, atau mengirim ulang setelah revisi.
 *
 * Setelah revisi, alur selalu diulang dari Atasan 1 dengan versi bertambah.
 * Alasannya teknis: revisi dapat mengubah nominal atau kategori, dan keduanya
 * menentukan rute. Pengajuan 150 juta yang direvisi jadi 250 juta harus dinilai
 * ulang, bukan melanjutkan dari tahap yang sudah lewat.
 */
rute.post('/:id/submit', wajibPeran('admin'), async (req, res) => {
  const hasil = await transaksi(async (c) => {
    const { rows } = await c.query('SELECT * FROM pengajuan WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!rows.length) return { kode: 404, pesan: 'Pengajuan tidak ditemukan.' };
    const p = rows[0];
    if (!['draft', 'perlu_revisi'].includes(p.status))
      return { kode: 409, pesan: 'Pengajuan ini sedang berjalan dan tidak bisa dikirim ulang.' };

    const { rows: item } = await c.query('SELECT count(*) AS n FROM pengajuan_item WHERE pengajuan_id = $1', [p.id]);
    if (Number(item[0].n) === 0) return { kode: 400, pesan: 'Rincian item belum diisi.' };
    if (!p.penerima_id) return { kode: 400, pesan: 'Penerima belum dipilih. Pilih dari master penerima, jangan ketik rekening.' };

    // Kota dengan LPJ menunggak tidak boleh mengajukan yang baru. Kontrol paling
    // murah dan paling ampuh - konsekuensinya langsung terasa oleh yang menunda.
    const { rows: nunggak } = await c.query(
      `SELECT nomor FROM pengajuan
        WHERE kota_id = $1 AND status_lpj IN ('belum_dibuat','draft','perlu_revisi')
          AND batas_lpj IS NOT NULL AND batas_lpj < CURRENT_DATE AND id <> $2 LIMIT 3`,
      [p.kota_id, p.id],
    );
    if (nunggak.length)
      return { kode: 409, pesan: `Kota ini punya LPJ menunggak: ${nunggak.map((x) => x.nomor).join(', ')}. Selesaikan dulu.` };

    // Kirim ulang: lepas kunci lama sebelum menghitung ulang, agar pagu tidak
    // terhitung dua kali.
    if (p.status === 'perlu_revisi') await lepasPagu(c, p.id);

    const snap = await hitungSnapshot(c, {
      kota_id: p.kota_id, periode_tahun: p.periode_tahun, periode_bulan: p.periode_bulan,
      nominal: p.total_nominal, pengajuan_id: p.id,
    });
    if (snap.wajibJustifikasi && !(req.body?.justifikasi_cost_ratio || p.justifikasi_cost_ratio))
      return {
        kode: 422,
        pesan: snap.snap_target === null
          ? 'Target kota untuk periode ini belum tersedia, sehingga justifikasi wajib diisi.'
          : 'Cost ratio melewati ambang, sehingga justifikasi wajib diisi.',
        cost_ratio_ini: snap.snap_cost_ratio_ini,
        cost_ratio_periode: snap.snap_cost_ratio_periode,
        ambang: snap.snap_ambang_cost_ratio,
      };

    const cek = await periksaPagu(c, {
      area_id: p.area_id, region_id: p.region_id, kategori_id: p.kategori_id,
      tahun: p.periode_tahun, bulan: p.periode_bulan, nominal: p.total_nominal,
    });
    if (!cek.ok) return { kode: 422, pesan: cek.pesan };
    if (cek.melebihiPagu && !(req.body?.alasan_melebihi_pagu || p.alasan_melebihi_pagu))
      return {
        kode: 422,
        pesan: 'Pengajuan melebihi sisa pagu region, sehingga alasan wajib diisi. Pengajuan akan diarahkan ke Atasan 3.',
        kelebihan: cek.kelebihan, sisa_region: cek.snapshot.sisa_region,
      };

    const versiBaru = p.status === 'perlu_revisi' ? p.versi_no + 1 : p.versi_no;
    const nomor = p.nomor.startsWith('DRAFT-') ? await nomorBaru(c, p.periode_tahun, p.periode_bulan) : p.nomor;

    await c.query(
      `UPDATE pengajuan SET nomor = $1, versi_no = $2, status = 'menunggu_atasan_1', disubmit_pada = now(),
              snap_data_per = $3, snap_histori_total = $4, snap_histori_rata2 = $5, snap_target = $6,
              snap_cost_ratio_ini = $7, snap_cost_ratio_periode = $8, snap_ambang_cost_ratio = $9,
              snap_batas_pagu = $10, snap_sisa_area = $11, snap_sisa_region = $12,
              snap_plan_versi_id = (SELECT id FROM plan_versi WHERE tahun = $13 AND status = 'berlaku'),
              melebihi_pagu = $14, alasan_melebihi_pagu = COALESCE($15, alasan_melebihi_pagu),
              justifikasi_cost_ratio = COALESCE($16, justifikasi_cost_ratio),
              jalur_cepat = FALSE, minta_pembatalan = FALSE
        WHERE id = $17`,
      [nomor, versiBaru, snap.snap_data_per, snap.snap_histori_total, snap.snap_histori_rata2, snap.snap_target,
       snap.snap_cost_ratio_ini, snap.snap_cost_ratio_periode, snap.snap_ambang_cost_ratio, snap.snap_batas_pagu,
       cek.snapshot.sisa_area, cek.snapshot.sisa_region, p.periode_tahun,
       cek.melebihiPagu, req.body?.alasan_melebihi_pagu ?? null, req.body?.justifikasi_cost_ratio ?? null, p.id],
    );

    await kunciPagu(c, p.id, p.kategori_id, p.periode_tahun, p.periode_bulan, cek.hold);

    const { rows: isi } = await c.query(
      `SELECT p.*, COALESCE((SELECT json_agg(i) FROM pengajuan_item i WHERE i.pengajuan_id = p.id),'[]') AS item
         FROM pengajuan p WHERE p.id = $1`, [p.id],
    );
    await c.query(
      'INSERT INTO pengajuan_versi_snapshot (pengajuan_id, versi_no, isi) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [p.id, versiBaru, JSON.stringify(isi[0])],
    );
    await c.query(
      `INSERT INTO pengajuan_log (pengajuan_id, versi_no, status_dari, status_ke, aksi, oleh)
       VALUES ($1,$2,$3,'menunggu_atasan_1','submit',$4)`,
      [p.id, versiBaru, p.status, req.pengguna.id],
    );
    await beriTahu(c, {
      peran: 'atasan_1', pengajuan_id: p.id, jenis: 'perlu_persetujuan',
      judul: `${nomor} menunggu persetujuan Anda`,
      isi: `${p.judul} — Rp ${uang(p.total_nominal).toLocaleString('id-ID')}`,
    });

    return { ok: true, nomor, versi: versiBaru, melebihiPagu: cek.melebihiPagu, pinjamRegion: cek.pinjamRegion };
  });

  if (!hasil.ok) return res.status(hasil.kode).json(hasil);
  res.json({ pesan: 'Pengajuan terkirim dan menunggu Atasan 1.', ...hasil, pengajuan: await isiPengajuan(req.params.id) });
});

// ---------------------------------------------------------------- aksi approver

/** Memastikan orang ini memang pemegang tahap sekarang, langsung atau lewat delegasi. */
async function pemegangSah(req, status) {
  const butuh = PEMEGANG[status];
  if (!butuh) return null;
  const daftar = await peranEfektif(req.pengguna.id, req.pengguna.peran);
  return daftar.find((d) => d.peran === butuh) ?? null;
}

rute.post('/:id/aksi', async (req, res) => {
  const aksi = req.body?.aksi;
  if (!['approve', 'revisi', 'reject'].includes(aksi))
    return res.status(400).json({ pesan: 'Aksi harus approve, revisi, atau reject.' });
  // Revisi dan reject wajib beralasan. Tanpa alasan, audit trail tidak berguna.
  if (aksi !== 'approve' && !req.body?.alasan)
    return res.status(400).json({ pesan: 'Alasan wajib diisi untuk revisi dan reject.' });

  const hasil = await transaksi(async (c) => {
    const { rows } = await c.query('SELECT * FROM pengajuan WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!rows.length) return { kode: 404, pesan: 'Pengajuan tidak ditemukan.' };
    const p = rows[0];

    const pemegang = await pemegangSah(req, p.status);
    if (!pemegang) return { kode: 403, pesan: `Pengajuan ini sedang di tahap ${p.status}, bukan tahap Anda.` };
    // Approver tidak boleh menyetujui pengajuan yang dibuatnya sendiri.
    if (Number(p.dibuat_oleh) === Number(req.pengguna.id))
      return { kode: 403, pesan: 'Anda tidak dapat menyetujui pengajuan yang Anda buat sendiri.' };

    let statusBaru, jalurCepat = p.jalur_cepat, sebab = null;

    if (aksi === 'reject') {
      statusBaru = 'ditolak';
      await lepasPagu(c, p.id);
    } else if (aksi === 'revisi') {
      statusBaru = 'perlu_revisi';
    } else {
      const lanjut = setelahApprove(p.status, {
        melebihi_pagu: p.melebihi_pagu, total_nominal: p.total_nominal, batas_pagu: p.snap_batas_pagu,
      });
      if (!lanjut) return { kode: 409, pesan: 'Tahap ini tidak dapat disetujui.' };
      statusBaru = lanjut.status;
      sebab = lanjut.sebab ?? null;
      if (lanjut.jalurCepat) jalurCepat = true;
      if (statusBaru === 'menunggu_realisasi')
        await c.query(
          `UPDATE pengajuan SET batas_lpj = tgl_selesai + (
             SELECT nilai::int FROM pengaturan WHERE kode = 'batas_waktu_lpj_hari' AND status = 'berlaku'
              ORDER BY berlaku_sejak DESC LIMIT 1) WHERE id = $1`,
          [p.id],
        );
    }

    // pengingat_jumlah direset ke nol setiap kali status berpindah - approver
    // di tahap baru belum pernah diingatkan sama sekali, jadi pengingat
    // pertamanya nanti wajib ke dia sendiri, bukan langsung ke atasannya.
    await c.query(
      'UPDATE pengajuan SET status = $1, jalur_cepat = $2, pengingat_terakhir = NULL, pengingat_jumlah = 0 WHERE id = $3',
      [statusBaru, jalurCepat, p.id],
    );
    await c.query(
      `INSERT INTO pengajuan_log (pengajuan_id, versi_no, status_dari, status_ke, aksi, oleh, atas_nama, alasan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [p.id, p.versi_no, p.status, statusBaru, aksi, req.pengguna.id, pemegang.atasNama, req.body?.alasan ?? null],
    );

    if (sebab && p.status === 'menunggu_atasan_2')
      await c.query(
        `INSERT INTO pengajuan_log (pengajuan_id, versi_no, status_dari, status_ke, aksi, alasan)
         VALUES ($1,$2,$3,$3,'rute_otomatis',$4)`,
        [p.id, p.versi_no, statusBaru, sebab],
      );

    // Atasan 3 diberi tahu saat pengajuan lolos jalur cepat - hanya mengetahui,
    // tanpa hak intervensi. Konsekuensinya Finance jadi gerbang terakhir.
    if (jalurCepat && statusBaru === 'menunggu_finance')
      await beriTahu(c, {
        peran: 'atasan_3', pengajuan_id: p.id, jenis: 'jalur_cepat',
        judul: `${p.nomor} lolos jalur cepat ke Finance`,
        isi: `Rp ${uang(p.total_nominal).toLocaleString('id-ID')} — di bawah batas pagu dan pagu region cukup.`,
      });

    const berikut = PEMEGANG[statusBaru];
    if (berikut)
      await beriTahu(c, {
        peran: berikut, pengajuan_id: p.id, jenis: 'perlu_persetujuan',
        judul: `${p.nomor} menunggu persetujuan Anda`,
        isi: `${p.judul} — Rp ${uang(p.total_nominal).toLocaleString('id-ID')}`,
      });

    if (['perlu_revisi', 'ditolak', 'menunggu_realisasi'].includes(statusBaru)) {
      await beriTahu(c, {
        pengguna_id: p.dibuat_oleh, pengajuan_id: p.id, jenis: statusBaru,
        judul: `${p.nomor} ${statusBaru === 'perlu_revisi' ? 'perlu revisi' : statusBaru === 'ditolak' ? 'ditolak' : 'disetujui penuh'}`,
        isi: req.body?.alasan ?? null,
      });
      // Disetujui final diberi tahu ke Admin dan Finance sekaligus - Finance
      // memang melihatnya di antrean, tapi antrean bukan pengganti notifikasi
      // saat pertama kali muncul di sana.
      if (statusBaru === 'menunggu_realisasi')
        await beriTahu(c, {
          peran: 'finance', pengajuan_id: p.id, jenis: 'siap_dibayar',
          judul: `${p.nomor} disetujui penuh, siap direalisasi`,
          isi: `${p.judul} — Rp ${uang(p.total_nominal).toLocaleString('id-ID')}`,
        });
    }

    // Reject bersifat final dan mahal - pengajuan sudah lewat beberapa tahap.
    // Seluruh orang yang pernah menyetujui versi ini diberi tahu, bukan cuma
    // Admin, karena artinya ada yang perlu ditinjau ulang di rantai
    // persetujuan yang sudah mereka lewati.
    if (aksi === 'reject') {
      const { rows: penyetuju } = await c.query(
        `SELECT DISTINCT oleh FROM pengajuan_log
          WHERE pengajuan_id = $1 AND versi_no = $2 AND aksi = 'approve' AND oleh IS NOT NULL`,
        [p.id, p.versi_no],
      );
      for (const { oleh } of penyetuju) {
        if (Number(oleh) === Number(p.dibuat_oleh)) continue; // sudah kebagian di atas
        await beriTahu(c, {
          pengguna_id: oleh, pengajuan_id: p.id, jenis: 'ditolak_setelah_disetujui',
          judul: `${p.nomor} ditolak setelah sempat Anda setujui`,
          isi: req.body?.alasan ?? null,
        });
      }
    }

    return { ok: true, status: statusBaru, jalurCepat, sebab };
  });

  if (!hasil.ok) return res.status(hasil.kode).json({ pesan: hasil.pesan });
  res.json({ pesan: `Pengajuan sekarang berstatus ${hasil.status}.`, ...hasil });
});

// ---------------------------------------------------------------- pembatalan

/**
 * Admin hanya dapat membatalkan saat draft atau perlu revisi. Di tengah alur, ia
 * menandai permintaan pembatalan - approver yang memegangnya yang mengeksekusi
 * lewat reject. Dengan begitu pembatalan tetap punya jejak persetujuan, dan pagu
 * yang terkunci ikut terlepas.
 */
rute.post('/:id/batal', wajibPeran('admin'), async (req, res) => {
  const hasil = await transaksi(async (c) => {
    const { rows } = await c.query('SELECT * FROM pengajuan WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!rows.length) return { kode: 404, pesan: 'Pengajuan tidak ditemukan.' };
    const p = rows[0];

    if (['draft', 'perlu_revisi'].includes(p.status)) {
      await lepasPagu(c, p.id);
      await c.query("UPDATE pengajuan SET status = 'dibatalkan' WHERE id = $1", [p.id]);
      await c.query(
        `INSERT INTO pengajuan_log (pengajuan_id, versi_no, status_dari, status_ke, aksi, oleh, alasan)
         VALUES ($1,$2,$3,'dibatalkan','batal',$4,$5)`,
        [p.id, p.versi_no, p.status, req.pengguna.id, req.body?.alasan ?? null],
      );
      return { ok: true, status: 'dibatalkan' };
    }

    if (!PEMEGANG[p.status]) return { kode: 409, pesan: 'Pengajuan pada tahap ini tidak dapat dibatalkan.' };

    await c.query('UPDATE pengajuan SET minta_pembatalan = TRUE WHERE id = $1', [p.id]);
    await c.query(
      `INSERT INTO pengajuan_log (pengajuan_id, versi_no, status_dari, status_ke, aksi, oleh, alasan)
       VALUES ($1,$2,$3,$3,'minta_pembatalan',$4,$5)`,
      [p.id, p.versi_no, p.status, req.pengguna.id, req.body?.alasan ?? 'Dibatalkan pemohon'],
    );
    await beriTahu(c, {
      peran: PEMEGANG[p.status], pengajuan_id: p.id, jenis: 'minta_pembatalan',
      judul: `${p.nomor} diminta dibatalkan pemohon`,
      isi: 'Tolak pengajuan ini dengan alasan "dibatalkan pemohon" agar pagunya terlepas.',
    });
    return { ok: true, status: p.status, minta_pembatalan: true };
  });

  if (!hasil.ok) return res.status(hasil.kode).json({ pesan: hasil.pesan });
  res.json(hasil.minta_pembatalan
    ? { pesan: 'Permintaan pembatalan terkirim ke approver yang sedang memegangnya.' }
    : { pesan: 'Pengajuan dibatalkan dan pagunya dilepas.' });
});
