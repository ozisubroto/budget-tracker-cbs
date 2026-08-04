import { ruteAman } from '../lib/rute.js';
import multer from 'multer';
import { q, transaksi } from '../lib/db.js';
import { wajibLogin, wajibPeran } from '../lib/auth.js';
import { bacaBerkasPlan } from '../lib/planExcel.js';

export const rute = ruteAman();
rute.use(wajibLogin);

const unggahan = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

rute.get('/versi', async (_req, res) => {
  const { rows } = await q(
    `SELECT pv.id, pv.tahun, pv.versi, pv.status, pv.alasan, pv.berlaku_sejak, pv.diunggah_pada,
            pu.nama AS diunggah_oleh, ps.nama AS disetujui_oleh,
            (SELECT count(*) FROM plan_region WHERE versi_id = pv.id) AS baris_region,
            (SELECT count(*) FROM plan_area   WHERE versi_id = pv.id) AS baris_area,
            (SELECT sum(plafon) FROM plan_region WHERE versi_id = pv.id) AS total_plafon
       FROM plan_versi pv
       JOIN pengguna pu ON pu.id = pv.diunggah_oleh
       LEFT JOIN pengguna ps ON ps.id = pv.disetujui_oleh
      ORDER BY pv.tahun DESC, pv.versi DESC`,
  );
  res.json(rows);
});

/**
 * Unggah master plan.
 *
 * Versi pertama sebuah tahun berlaku tanpa persetujuan selama belum ada satu pun
 * pengajuan tercatat pada tahun itu - belum ada yang terpengaruh, jadi tidak ada
 * yang perlu dilindungi, dan Super Admin boleh mengunggah ulang berkali-kali
 * sampai angkanya benar.
 *
 * Begitu pengajuan pertama masuk, sistem mengunci: versi berikutnya wajib
 * disetujui Atasan 3. Pemicunya fakta yang dapat diperiksa sistem, bukan tanggal
 * atau niat, sehingga tidak ada ruang tafsir.
 */
rute.post('/unggah', wajibPeran('super_admin'), unggahan.single('berkas'), async (req, res) => {
  const tahun = Number(req.body?.tahun);
  if (!Number.isInteger(tahun) || tahun < 2020 || tahun > 2100)
    return res.status(400).json({ pesan: 'Tahun anggaran wajib diisi dengan benar.' });
  if (!req.file) return res.status(400).json({ pesan: 'Berkas Excel belum dipilih.' });

  const [region, area, kategori] = await Promise.all([
    q('SELECT id, nama FROM region WHERE aktif').then((r) => r.rows),
    q('SELECT id, nama, region_id FROM area WHERE aktif').then((r) => r.rows),
    q('SELECT id, nama FROM kategori_budget WHERE aktif').then((r) => r.rows),
  ]);

  const hasil = bacaBerkasPlan(req.file.buffer, { tahun, region, area, kategori });
  if (!hasil.ok)
    return res.status(422).json({
      pesan: 'Berkas ditolak. Perbaiki seluruh masalah di bawah, lalu unggah ulang.',
      jumlahGalat: hasil.jumlahGalat ?? hasil.galat.length,
      galat: hasil.galat,
    });

  const adaPengajuan = Number(
    (await q('SELECT count(*) AS n FROM pengajuan WHERE periode_tahun = $1', [tahun])).rows[0].n,
  ) > 0;

  // Plafon baru tidak boleh lebih kecil dari yang sudah terserap. Tanpa aturan
  // ini, satu unggahan bisa menciptakan over-budget retroaktif pada pengajuan
  // yang sudah disetujui dengan sah - dan tidak ada yang bisa memperbaikinya
  // karena uangnya sudah keluar.
  if (adaPengajuan) {
    const { rows: terserap } = await q(
      `SELECT region_id, kategori_id, bulan, terkunci + terpakai AS terserap
         FROM v_pagu_region WHERE tahun = $1 AND terkunci + terpakai > 0`,
      [tahun],
    );
    const namaRegion = new Map(region.map((r) => [r.id, r.nama]));
    const namaKategori = new Map(kategori.map((k) => [k.id, k.nama]));
    const galat = [];
    for (const t of terserap) {
      const baru = hasil.plafon.find(
        (p) => p.region_id === Number(t.region_id) && p.kategori_id === Number(t.kategori_id) && p.bulan === t.bulan,
      );
      if (baru && Math.round(baru.plafon * 100) < Math.round(Number(t.terserap) * 100))
        galat.push(
          `${namaRegion.get(Number(t.region_id))} / ${namaKategori.get(Number(t.kategori_id))} / bulan ${t.bulan}: ` +
          `plafon baru ${baru.plafon.toLocaleString('id-ID')} di bawah yang sudah terserap ${Number(t.terserap).toLocaleString('id-ID')}.`,
        );
    }
    if (galat.length)
      return res.status(422).json({ pesan: 'Berkas ditolak. Plafon tidak boleh turun di bawah yang sudah terserap.', galat });
  }

  const versiBaru = await transaksi(async (c) => {
    const n = Number((await c.query('SELECT COALESCE(max(versi), 0) + 1 AS v FROM plan_versi WHERE tahun = $1', [tahun])).rows[0].v);
    const status = adaPengajuan ? 'menunggu_persetujuan' : 'berlaku';

    if (status === 'berlaku')
      await c.query("UPDATE plan_versi SET status = 'ditolak' WHERE tahun = $1 AND status = 'berlaku'", [tahun]);

    const { rows } = await c.query(
      `INSERT INTO plan_versi (tahun, versi, status, alasan, diunggah_oleh, berlaku_sejak)
       VALUES ($1, $2, $3::status_plan, $4, $5, $6)
       RETURNING id`,
      [tahun, n, status, req.body?.alasan ?? null, req.pengguna.id, status === 'berlaku' ? new Date() : null],
    );
    const versiId = rows[0].id;

    // Disisipkan sekaligus, bukan baris per baris - ribuan perjalanan ke basis
    // data akan membuat unggahan terasa menggantung.
    await c.query(
      `INSERT INTO plan_region (versi_id, region_id, kategori_id, tahun, bulan, plafon)
       SELECT $1, x.region_id, x.kategori_id, x.tahun, x.bulan, x.plafon
         FROM jsonb_to_recordset($2::jsonb)
              AS x(region_id bigint, kategori_id bigint, tahun smallint, bulan smallint, plafon numeric)`,
      [versiId, JSON.stringify(hasil.plafon)],
    );
    await c.query(
      `INSERT INTO plan_area (versi_id, area_id, kategori_id, tahun, bulan, alokasi)
       SELECT $1, x.area_id, x.kategori_id, x.tahun, x.bulan, x.alokasi
         FROM jsonb_to_recordset($2::jsonb)
              AS x(area_id bigint, kategori_id bigint, tahun smallint, bulan smallint, alokasi numeric)`,
      [versiId, JSON.stringify(hasil.alokasi)],
    );

    await c.query(
      `INSERT INTO audit_master (tabel, record_id, aksi, oleh, sesudah)
       VALUES ('plan_versi', $1, 'insert', $2, $3)`,
      [versiId, req.pengguna.id, JSON.stringify({ tahun, versi: n, status, ...hasil.ringkasan })],
    );

    return { id: versiId, versi: n, status };
  });

  res.status(201).json({
    pesan:
      versiBaru.status === 'berlaku'
        ? 'Master plan tersimpan dan langsung berlaku.'
        : 'Master plan tersimpan. Menunggu persetujuan Atasan 3 sebelum berlaku.',
    ...versiBaru,
    ringkasan: hasil.ringkasan,
  });
});

rute.post('/versi/:id/setujui', wajibPeran('atasan_3'), async (req, res) => {
  const hasil = await transaksi(async (c) => {
    const { rows } = await c.query("SELECT * FROM plan_versi WHERE id = $1 AND status = 'menunggu_persetujuan'", [req.params.id]);
    if (!rows.length) return null;
    const v = rows[0];
    await c.query("UPDATE plan_versi SET status = 'ditolak' WHERE tahun = $1 AND status = 'berlaku'", [v.tahun]);
    await c.query(
      `UPDATE plan_versi SET status = 'berlaku', disetujui_oleh = $1, disetujui_pada = now(), berlaku_sejak = now()
        WHERE id = $2`,
      [req.atasNama ?? req.pengguna.id, v.id],
    );
    return v;
  });
  if (!hasil) return res.status(404).json({ pesan: 'Versi tidak ditemukan atau tidak sedang menunggu persetujuan.' });
  res.json({ pesan: `Master plan ${hasil.tahun} versi ${hasil.versi} sekarang berlaku.` });
});

rute.post('/versi/:id/tolak', wajibPeran('atasan_3'), async (req, res) => {
  if (!req.body?.alasan) return res.status(400).json({ pesan: 'Alasan penolakan wajib diisi.' });
  const { rowCount } = await q(
    `UPDATE plan_versi SET status = 'ditolak', alasan = $1, disetujui_oleh = $2, disetujui_pada = now()
      WHERE id = $3 AND status = 'menunggu_persetujuan'`,
    [req.body.alasan, req.atasNama ?? req.pengguna.id, req.params.id],
  );
  if (!rowCount) return res.status(404).json({ pesan: 'Versi tidak ditemukan atau tidak sedang menunggu persetujuan.' });
  res.json({ pesan: 'Versi ditolak. Master plan sebelumnya tetap berlaku.' });
});
