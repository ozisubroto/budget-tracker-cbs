import { ruteAman } from '../lib/rute.js';
import { q } from '../lib/db.js';
import { wajibLogin, wajibPeran } from '../lib/auth.js';
import { normalisasiNoWa } from '../lib/wa.js';

export const rute = ruteAman();
rute.use(wajibLogin);

// Hierarki Kota -> Area -> Region. Admin memilih kota; area dan region terisi
// otomatis dan terkunci, lalu ikut disimpan sebagai snapshot saat submit.
rute.get('/wilayah', async (_req, res) => {
  const { rows } = await q(
    `SELECT k.id AS kota_id, k.nama AS kota, k.kode_kanonik,
            a.id AS area_id, a.nama AS area,
            r.id AS region_id, r.nama AS region, r.profil
       FROM kota k
       JOIN area a   ON a.id = k.area_id
       JOIN region r ON r.id = a.region_id
      WHERE k.aktif AND a.aktif AND r.aktif
      ORDER BY r.nama, a.nama, k.nama`,
  );
  res.json(rows);
});

rute.get('/kategori', async (_req, res) => {
  const { rows } = await q('SELECT id, kode, nama FROM kategori_budget WHERE aktif ORDER BY urutan');
  res.json(rows);
});

// Hanya nilai yang berstatus berlaku dan tanggal berlakunya sudah lewat.
// Pengajuan lama tetap terbaca dengan aturan yang berlaku saat itu karena
// nilainya ikut di-snapshot pada baris pengajuan.
rute.get('/pengaturan', async (_req, res) => {
  const { rows } = await q(
    `SELECT DISTINCT ON (kode) kode, nilai, berlaku_sejak
       FROM pengaturan
      WHERE status = 'berlaku' AND berlaku_sejak <= now()
      ORDER BY kode, berlaku_sejak DESC`,
  );
  res.json(Object.fromEntries(rows.map((r) => [r.kode, r.nilai])));
});

// ---------------------------------------------------------------- master penerima

// Dikelola Finance, bukan Super Admin. Yang membayar adalah yang paling
// berkepentingan memastikan rekeningnya benar, dan memisahkan keduanya hanya
// memperlambat tanpa menambah keamanan.
//
// Nomor rekening tidak pernah diketik di form pengajuan. Ini menutup titik rawan
// penyalahgunaan yang paling umum: satu digit diubah, dan approval tetap terlihat
// sah karena semua orang memeriksa nominal, bukan rekening.
rute.get('/penerima', async (_req, res) => {
  const { rows } = await q(
    `SELECT id, jenis, nama, bank, no_rekening FROM penerima WHERE aktif ORDER BY jenis, nama`,
  );
  res.json(rows);
});

rute.post('/penerima', wajibPeran('finance'), async (req, res) => {
  const b = req.body ?? {};
  if (!b.jenis || !b.nama) return res.status(400).json({ pesan: 'Jenis dan nama penerima wajib diisi.' });
  if (b.jenis !== 'kas' && (!b.bank || !b.no_rekening))
    return res.status(400).json({ pesan: 'Bank dan nomor rekening wajib diisi untuk penerima selain kas.' });

  const { rows } = await q(
    `INSERT INTO penerima (jenis, nama, bank, no_rekening, dibuat_oleh) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [b.jenis, b.nama, b.bank ?? null, b.no_rekening ?? null, req.pengguna.id],
  );
  res.status(201).json(rows[0]);
});

rute.patch('/penerima/:id', wajibPeran('finance'), async (req, res) => {
  const { rows } = await q(
    `UPDATE penerima SET nama = COALESCE($1, nama), bank = COALESCE($2, bank),
            no_rekening = COALESCE($3, no_rekening), aktif = COALESCE($4, aktif)
      WHERE id = $5 RETURNING *`,
    [req.body?.nama ?? null, req.body?.bank ?? null, req.body?.no_rekening ?? null, req.body?.aktif ?? null, req.params.id],
  );
  if (!rows.length) return res.status(404).json({ pesan: 'Penerima tidak ditemukan.' });
  res.json(rows[0]);
});

// ---------------------------------------------------------------- pengaturan & kategori

// Dua pengaturan menentukan seberapa banyak yang lolos tanpa pengawasan, jadi
// tidak boleh berubah hanya karena satu akun teknis menekan simpan.
const WAJIB_ATASAN_3 = ['batas_pagu_atasan_2', 'ambang_cost_ratio'];

rute.get('/pengaturan/riwayat', wajibPeran('super_admin', 'atasan_3'), async (_req, res) => {
  const { rows } = await q(
    `SELECT p.*, pu.nama AS diusulkan_oleh_nama, ps.nama AS disetujui_oleh_nama
       FROM pengaturan p
       JOIN pengguna pu ON pu.id = p.diusulkan_oleh
       LEFT JOIN pengguna ps ON ps.id = p.disetujui_oleh
      ORDER BY p.kode, p.berlaku_sejak DESC`,
  );
  res.json(rows);
});

rute.post('/pengaturan', wajibPeran('super_admin'), async (req, res) => {
  const { kode, nilai, catatan } = req.body ?? {};
  if (!kode || nilai === undefined) return res.status(400).json({ pesan: 'Kode dan nilai wajib diisi.' });
  const perluPersetujuan = WAJIB_ATASAN_3.includes(kode);

  const { rows } = await q(
    `INSERT INTO pengaturan (kode, nilai, berlaku_sejak, status, diusulkan_oleh, disetujui_oleh, disetujui_pada, catatan)
     VALUES ($1,$2,now(),$3,$4,NULL,NULL,$5) RETURNING *`,
    [kode, nilai, perluPersetujuan ? 'menunggu_persetujuan' : 'berlaku', req.pengguna.id, catatan ?? null],
  );
  res.status(201).json({
    pesan: perluPersetujuan
      ? 'Usulan tersimpan. Nilai lama tetap berlaku sampai Atasan 3 menyetujui.'
      : 'Pengaturan berlaku mulai sekarang.',
    pengaturan: rows[0],
  });
});

rute.post('/pengaturan/:id/setujui', wajibPeran('atasan_3'), async (req, res) => {
  const { rows } = await q(
    `UPDATE pengaturan SET status = 'berlaku', disetujui_oleh = $1, disetujui_pada = now(), berlaku_sejak = now()
      WHERE id = $2 AND status = 'menunggu_persetujuan' RETURNING *`,
    [req.atasNama ?? req.pengguna.id, req.params.id],
  );
  if (!rows.length) return res.status(404).json({ pesan: 'Usulan tidak ditemukan atau sudah diputuskan.' });
  res.json({ pesan: 'Pengaturan berlaku mulai sekarang.', pengaturan: rows[0] });
});

rute.post('/kategori', wajibPeran('super_admin'), async (req, res) => {
  const { kode, nama, urutan } = req.body ?? {};
  if (!kode || !nama) return res.status(400).json({ pesan: 'Kode dan nama kategori wajib diisi.' });
  const { rows } = await q(
    'INSERT INTO kategori_budget (kode, nama, urutan) VALUES ($1,$2,$3) RETURNING *',
    [kode, nama, urutan ?? 99],
  );
  res.status(201).json(rows[0]);
});

// Kategori yang sudah pernah dipakai tidak boleh dihapus, hanya dinonaktifkan -
// menghapusnya membuat pengajuan dan laporan lama kehilangan kategorinya.
rute.patch('/kategori/:id', wajibPeran('super_admin'), async (req, res) => {
  const { rows } = await q(
    'UPDATE kategori_budget SET nama = COALESCE($1, nama), aktif = COALESCE($2, aktif), urutan = COALESCE($3, urutan) WHERE id = $4 RETURNING *',
    [req.body?.nama ?? null, req.body?.aktif ?? null, req.body?.urutan ?? null, req.params.id],
  );
  if (!rows.length) return res.status(404).json({ pesan: 'Kategori tidak ditemukan.' });
  res.json(rows[0]);
});

rute.get('/pengguna', wajibPeran('super_admin', 'atasan_1', 'atasan_2', 'atasan_3', 'finance', 'admin'), async (_req, res) => {
  const { rows } = await q('SELECT id, nama, email, peran, jabatan, no_wa, aktif FROM pengguna ORDER BY peran');
  res.json(rows);
});

rute.patch('/pengguna/:id', wajibPeran('super_admin'), async (req, res) => {
  let noWa;
  try {
    // undefined berarti field tidak dikirim - dibiarkan seperti semula.
    // null berarti dikosongkan sengaja (orang itu hanya menerima notifikasi
    // di dalam aplikasi). Keduanya harus dibedakan dari COALESCE biasa.
    noWa = req.body?.no_wa === undefined ? undefined : normalisasiNoWa(req.body.no_wa);
  } catch (e) {
    return res.status(422).json({ pesan: e.message });
  }

  const { rows } = await q(
    `UPDATE pengguna SET nama = COALESCE($1, nama), jabatan = COALESCE($2, jabatan),
            no_wa = CASE WHEN $3 THEN $4 ELSE no_wa END, aktif = COALESCE($5, aktif)
      WHERE id = $6 RETURNING id, nama, email, peran, jabatan, no_wa, aktif`,
    [req.body?.nama ?? null, req.body?.jabatan ?? null, noWa !== undefined, noWa ?? null, req.body?.aktif ?? null, req.params.id],
  );
  if (!rows.length) return res.status(404).json({ pesan: 'Pengguna tidak ditemukan.' });
  res.json(rows[0]);
});
