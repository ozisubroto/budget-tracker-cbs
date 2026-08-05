/**
 * Uji celah notifikasi Fase 5: normalisasi nomor WA, Finance diberi tahu saat
 * disetujui final, dan reject menjangkau seluruh penyetuju sebelumnya.
 *
 *   PORT=3000 npm run uji:notifikasi
 */
const B = `http://localhost:${process.env.PORT}`;
const tok = {}, uid = {};
const j = async (m, u, t, b) => {
  const r = await fetch(B + u, { method: m,
    headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
let lulus = 0, gagal = 0;
const cek = (n, s, c = '') => { console.log(`  ${s ? 'LULUS' : 'GAGAL'}  ${n}${c ? ' — ' + c : ''}`); s ? lulus++ : gagal++; };

for (const p of ['admin', 'atasan1', 'atasan2', 'atasan3', 'finance', 'superadmin']) {
  tok[p] = (await j('POST', '/api/auth/masuk', null, { email: `${p}@cbsgroup.co.id`, sandi: 'Uji123' })).data.token;
  uid[p] = (await j('GET', '/api/auth/saya', tok[p])).data.id;
}

console.log('\n=== 1. Normalisasi nomor WhatsApp ===');
const kasus = [
  ['081234567890', '6281234567890'],
  ['+62 812-3456-7890', '6281234567890'],
  ['6281234567890', '6281234567890'],
];
for (const [masuk, harap] of kasus) {
  const r = await j('PATCH', `/api/master/pengguna/${uid.atasan1}`, tok.superadmin, { no_wa: masuk });
  cek(`"${masuk}" -> "${harap}"`, r.data.no_wa === harap, `dapat "${r.data.no_wa}"`);
}
let r = await j('PATCH', `/api/master/pengguna/${uid.atasan1}`, tok.superadmin, { no_wa: 'bukan-nomor' });
cek('nomor tidak masuk akal ditolak', r.status === 422, r.data.pesan);
r = await j('PATCH', `/api/master/pengguna/${uid.atasan1}`, tok.superadmin, { no_wa: null });
cek('dikosongkan sengaja diterima', r.status === 200 && r.data.no_wa === null);
r = await j('PATCH', `/api/master/pengguna/${uid.atasan1}`, tok.superadmin, { jabatan: 'GM Sales Offline' });
cek('field lain tidak menyentuh no_wa', r.status === 200 && r.data.no_wa === null, 'tidak dikirim = tidak diubah');
await j('PATCH', `/api/master/pengguna/${uid.atasan1}`, tok.superadmin, { no_wa: '081234567890' });

console.log('\n=== Menyiapkan pengajuan berjalan penuh sampai selesai ===');
const wilayah = (await j('GET', '/api/master/wilayah', tok.admin)).data;
const kategori = (await j('GET', '/api/master/kategori', tok.admin)).data;
const dipakai = new Set((await j('GET', '/api/laporan/serapan/kota?tahun=2026', tok.admin)).data.map((x) => Number(x.kota_id)));
const jumlahKota = {};
for (const w of wilayah) jumlahKota[w.region] = (jumlahKota[w.region] ?? 0) + 1;
// Cari kombinasi region yang masih punya kota belum terpakai DAN pagu cukup -
// data uji sebelumnya sudah memakai banyak kota, jadi tidak bisa asal ambil
// region berpagu terbesar seperti semula.
const kandidat = (await j('GET', '/api/pagu/region?tahun=2026', tok.admin)).data
  .filter((x) => Number(x.tersedia) > 10_000_000)
  .sort((a, b) => Number(b.tersedia) - Number(a.tersedia));
let pagu, kota;
for (const k of kandidat) {
  const bebas = wilayah.filter((w) => w.region === k.region).find((w) => !dipakai.has(Number(w.kota_id)));
  if (bebas) { pagu = k; kota = bebas; dipakai.add(Number(bebas.kota_id)); break; }
}
if (!kota) throw new Error('Tidak ada kombinasi region/kota tersisa untuk uji - jalankan pada basis data yang lebih segar.');
const penerima_id = (await j('POST', '/api/master/penerima', tok.finance,
  { jenis: 'vendor', nama: 'PT Notifikasi Uji', bank: 'BCA', no_rekening: '000111222' })).data.id;

function kotaBaru() {
  const k = wilayah.find((w) => !dipakai.has(Number(w.kota_id)));
  dipakai.add(Number(k.kota_id));
  return k;
}

async function buatKirim(judul, nominal) {
  const kotaPakai = kotaBaru();
  const c = await j('POST', '/api/pengajuan', tok.admin, {
    kota_id: kotaPakai.kota_id, kategori_id: kategori.find((k) => k.nama === pagu.kategori).id,
    periode_tahun: 2026, periode_bulan: pagu.bulan, judul,
    tgl_mulai: '2026-06-01', tgl_selesai: '2026-06-10', penerima_id,
  });
  await j('PUT', `/api/pengajuan/${c.data.id}/item`, tok.admin, { item: [{ nama: 'x', qty: 1, harga_satuan: nominal }] });
  await j('POST', `/api/pengajuan/${c.data.id}/submit`, tok.admin, { justifikasi_cost_ratio: 'x', alasan_melebihi_pagu: 'x' });
  return c.data.id;
}

const belumBaca = async (peran) => (await j('GET', '/api/notifikasi?belum=1', tok[peran])).data.notifikasi;

console.log('\n=== 2. Finance diberi tahu saat disetujui final ===');
const sblmFinance = (await belumBaca('finance')).length;
const id1 = await buatKirim('Uji notifikasi Finance', 3_000_000);
for (const peran of ['atasan1', 'atasan2', 'atasan3']) {
  const d = (await j('GET', `/api/pengajuan/${id1}`, tok.admin)).data;
  if (d.status === 'menunggu_finance' || d.status === 'menunggu_realisasi') break;
  await j('POST', `/api/pengajuan/${id1}/aksi`, tok[peran], { aksi: 'approve' });
}
await j('POST', `/api/pengajuan/${id1}/aksi`, tok.finance, { aksi: 'approve' });
const setelahFinance = await belumBaca('finance');
const notifFinance = setelahFinance.find((n) => n.jenis === 'siap_dibayar' && n.pengajuan_id == id1);
cek('Finance menerima notifikasi disetujui final', !!notifFinance, notifFinance?.judul);

console.log('\n=== 3. Reject menjangkau seluruh penyetuju sebelumnya ===');
const id2 = await buatKirim('Uji notifikasi reject berjenjang', 3_500_000);
await j('POST', `/api/pengajuan/${id2}/aksi`, tok.atasan1, { aksi: 'approve' });
await j('POST', `/api/pengajuan/${id2}/aksi`, tok.atasan2, { aksi: 'approve' });
const sblmA1 = (await belumBaca('atasan1')).length;
const sblmA2 = (await belumBaca('atasan2')).length;
const d2 = (await j('GET', `/api/pengajuan/${id2}`, tok.admin)).data;
await j('POST', `/api/pengajuan/${id2}/aksi`, tok[d2.status === 'menunggu_atasan_3' ? 'atasan3' : 'finance'],
  { aksi: 'reject', alasan: 'Uji: perlu ditinjau ulang oleh yang sudah menyetujui' });

const a1 = await belumBaca('atasan1'), a2 = await belumBaca('atasan2');
cek('Atasan 1 (penyetuju awal) diberi tahu',
  a1.some((n) => n.jenis === 'ditolak_setelah_disetujui' && n.pengajuan_id == id2), `${a1.length - sblmA1} notifikasi baru`);
cek('Atasan 2 (penyetuju kedua) diberi tahu',
  a2.some((n) => n.jenis === 'ditolak_setelah_disetujui' && n.pengajuan_id == id2), `${a2.length - sblmA2} notifikasi baru`);
const admin2 = await belumBaca('admin');
cek('Admin (pembuat) tetap diberi tahu seperti biasa',
  admin2.some((n) => n.jenis === 'ditolak' && n.pengajuan_id == id2));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
