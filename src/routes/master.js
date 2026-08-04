import { ruteAman } from '../lib/rute.js';
import { q } from '../lib/db.js';
import { wajibLogin, wajibPeran } from '../lib/auth.js';

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
