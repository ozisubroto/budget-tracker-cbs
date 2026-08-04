import { ruteAman } from '../lib/rute.js';
import { q } from '../lib/db.js';
import { wajibLogin } from '../lib/auth.js';

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
