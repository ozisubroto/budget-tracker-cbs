import { pool } from './db.js';

// Pemeriksaan cepat isi basis data dari dalam kontainer, tanpa perlu mengetik
// perintah panjang: npm run cek
const { rows } = await pool.query(`
  SELECT 'pengguna'  AS tabel, count(*) AS jumlah, string_agg(peran::text, ', ' ORDER BY id) AS isi FROM pengguna WHERE aktif
  UNION ALL SELECT 'region',   count(*), string_agg(nama, ', ' ORDER BY id) FROM region
  UNION ALL SELECT 'area',     count(*), NULL FROM area
  UNION ALL SELECT 'kota',     count(*), NULL FROM kota
  UNION ALL SELECT 'kategori', count(*), NULL FROM kategori_budget WHERE aktif
  UNION ALL SELECT 'pengaturan', count(*), string_agg(kode, ', ') FROM pengaturan WHERE status = 'berlaku'
  UNION ALL SELECT 'pengajuan', count(*), NULL FROM pengajuan`);

for (const r of rows) console.log(`${r.tabel.padEnd(11)} ${String(r.jumlah).padStart(4)}  ${r.isi ?? ''}`);
await pool.end();
