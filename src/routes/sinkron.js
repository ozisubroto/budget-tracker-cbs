import { ruteAman } from '../lib/rute.js';
import { q } from '../lib/db.js';
import { wajibLogin, wajibPeran } from '../lib/auth.js';
import { sinkronSales } from '../lib/sinkronSales.js';

export const rute = ruteAman();
rute.use(wajibLogin);

// Penarikan manual, untuk mencoba sambungan atau mengejar data setelah gangguan.
rute.post('/sales', wajibPeran('super_admin'), async (req, res) => {
  const tahun = Number(req.body?.tahun) || new Date().getFullYear();
  res.json(await sinkronSales(tahun));
});

rute.get('/riwayat', async (_req, res) => {
  const { rows } = await q(
    `SELECT id, mulai, selesai, jumlah_baris, kota_tidak_cocok, berhasil, pesan
       FROM sinkronisasi_log ORDER BY mulai DESC LIMIT 20`,
  );
  res.json(rows);
});

// Kota yang belum punya data penjualan sama sekali pada tahun berjalan.
rute.get('/kota-tanpa-data', async (req, res) => {
  const tahun = Number(req.query.tahun) || new Date().getFullYear();
  const { rows } = await q(
    `SELECT k.nama AS kota, k.kode_kanonik, a.nama AS area, r.nama AS region
       FROM kota k
       JOIN area a ON a.id = k.area_id
       JOIN region r ON r.id = a.region_id
      WHERE k.aktif
        AND NOT EXISTS (SELECT 1 FROM sales_kota_bulan s WHERE s.kota_id = k.id AND s.tahun = $1)
      ORDER BY r.nama, a.nama, k.nama`,
    [tahun],
  );
  res.json({ tahun, jumlah: rows.length, kota: rows });
});
