/**
 * Uji pengingat pengajuan menggantung.
 *
 *   PORT=3000 npm run uji:pengingat
 *
 * Memastikan urutan "approver, lalu atasannya" benar-benar berurutan:
 * pengingat pertama ke pemegang tahap sebenarnya, baru pengingat berikutnya
 * dieskalasi. Ini bug nyata yang sempat lolos di percobaan pertama - kode
 * lama langsung melompat ke atasan sejak pengingat pertama, melewati orang
 * yang sebenarnya sedang memegang tahap itu.
 *
 * Memanipulasi waktu langsung di basis data untuk mensimulasikan pengajuan
 * yang sudah lama menggantung. Jalankan hanya pada basis data pengembangan.
 */
import pg from 'pg';

const B = `http://localhost:${process.env.PORT}`;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const j = async (m, u, t, b) => {
  const r = await fetch(B + u, { method: m,
    headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
let lulus = 0, gagal = 0;
const cek = (n, s, c = '') => { console.log(`  ${s ? 'LULUS' : 'GAGAL'}  ${n}${c ? ' — ' + c : ''}`); s ? lulus++ : gagal++; };

const tok = {};
for (const p of ['admin', 'atasan1', 'atasan2', 'atasan3', 'finance', 'superadmin'])
  tok[p] = (await j('POST', '/api/auth/masuk', null, { email: `${p}@cbsgroup.co.id`, sandi: 'Uji123' })).data.token;

const wilayah = (await j('GET', '/api/master/wilayah', tok.admin)).data;
const kategori = (await j('GET', '/api/master/kategori', tok.admin)).data;
const dipakai = new Set((await j('GET', '/api/laporan/serapan/kota?tahun=2026', tok.admin)).data.map((x) => Number(x.kota_id)));
const pagu = (await j('GET', '/api/pagu/region?tahun=2026', tok.admin)).data.filter((x) => Number(x.tersedia) > 10_000_000)[0];
const kota = wilayah.filter((w) => w.region === pagu.region).find((w) => !dipakai.has(Number(w.kota_id)));
const penerima_id = (await j('POST', '/api/master/penerima', tok.finance,
  { jenis: 'vendor', nama: 'PT Uji Pengingat', bank: 'BCA', no_rekening: '55501' })).data.id;

const c = await j('POST', '/api/pengajuan', tok.admin, {
  kota_id: kota.kota_id, kategori_id: kategori.find((k) => k.nama === pagu.kategori).id,
  periode_tahun: 2026, periode_bulan: pagu.bulan, judul: 'Uji pengingat berjenjang',
  tgl_mulai: '2026-06-01', tgl_selesai: '2026-06-10', penerima_id,
});
const id = c.data.id;
await j('PUT', `/api/pengajuan/${id}/item`, tok.admin, { item: [{ nama: 'x', qty: 1, harga_satuan: 3_000_000 }] });
await j('POST', `/api/pengajuan/${id}/submit`, tok.admin, { justifikasi_cost_ratio: 'x', alasan_melebihi_pagu: 'x' });

await pool.query("UPDATE pengajuan_log SET waktu = now() - interval '3 days' WHERE pengajuan_id = $1", [id]);
await pool.query("UPDATE pengajuan SET dibuat_pada = now() - interval '3 days' WHERE id = $1", [id]);

const belumMenggantung = async (peran) =>
  (await j('GET', '/api/notifikasi?belum=1', tok[peran])).data.notifikasi
    .filter((n) => n.jenis === 'menggantung' && n.pengajuan_id == id);

console.log('\n=== Pengingat pertama: harus ke Atasan 1, bukan lompat ke Atasan 2 ===');
let r = await j('POST', '/api/notifikasi/pengingat/proses', tok.superadmin);
cek('penjadwal berjalan', r.status === 200, JSON.stringify(r.data));
cek('Atasan 1 (pemegang sebenarnya) menerima pengingat', (await belumMenggantung('atasan1')).length > 0);
cek('Atasan 2 belum menerima apa pun', (await belumMenggantung('atasan2')).length === 0);

console.log('\n=== Dipanggil lagi segera: tidak boleh dobel dalam 20 jam ===');
r = await j('POST', '/api/notifikasi/pengingat/proses', tok.superadmin);
cek('tidak ada yang dikirim ulang', r.data.dikirim === 0, JSON.stringify(r.data));

console.log('\n=== Pengingat kedua: harus dieskalasi ke Atasan 2 ===');
await pool.query("UPDATE pengajuan SET pengingat_terakhir = now() - interval '21 hours' WHERE id = $1", [id]);
await j('POST', '/api/notifikasi/pengingat/proses', tok.superadmin);
cek('Atasan 2 sekarang menerima pengingat eskalasi', (await belumMenggantung('atasan2')).length > 0);
const { rows } = await pool.query('SELECT pengingat_jumlah FROM pengajuan WHERE id = $1', [id]);
cek('hitungan pengingat bertambah jadi 2', Number(rows[0].pengingat_jumlah) === 2, `dapat ${rows[0].pengingat_jumlah}`);

console.log('\n=== Super Admin tidak boleh terlibat sama sekali ===');
cek('Super Admin tidak menerima pengingat apa pun', (await belumMenggantung('superadmin')).length === 0);

console.log('\n=== Perpindahan status mereset hitungan ke nol ===');
await j('POST', `/api/pengajuan/${id}/aksi`, tok.atasan1, { aksi: 'approve' });
const { rows: r2 } = await pool.query('SELECT pengingat_jumlah, pengingat_terakhir FROM pengajuan WHERE id = $1', [id]);
cek('pengingat_jumlah kembali 0', Number(r2[0].pengingat_jumlah) === 0);
cek('pengingat_terakhir kembali NULL', r2[0].pengingat_terakhir === null);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
await pool.end();
process.exit(gagal ? 1 : 0);
