/**
 * Uji delegasi berjangka dan notifikasi.
 *
 *   PORT=3000 npm run uji:delegasi
 *
 * Yang paling penting diperiksa di sini bukan bahwa delegasi bisa dibuat, tapi
 * bahwa arahnya tidak bisa dibalik dan jejaknya menyebut dua nama.
 */
const B = `http://localhost:${process.env.PORT}`;
const tok = {}, uid = {};
const j = async (m, u, t, b) => {
  const r = await fetch(B + u, {
    method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
let lulus = 0, gagal = 0;
const cek = (n, s, c = '') => { console.log(`  ${s ? 'LULUS' : 'GAGAL'}  ${n}${c ? ' — ' + c : ''}`); s ? lulus++ : gagal++; };
const hariIni = new Date().toISOString().slice(0, 10);
const besok = new Date(Date.now() + 864e5).toISOString().slice(0, 10);

for (const p of ['admin', 'atasan1', 'atasan2', 'atasan3', 'finance', 'superadmin']) {
  tok[p] = (await j('POST', '/api/auth/masuk', null, { email: `${p}@cbsgroup.co.id`, sandi: 'Uji123' })).data.token;
  uid[p] = (await j('GET', '/api/auth/saya', tok[p])).data.id;
}

console.log('\n=== Aturan arah delegasi ===');
let r = await j('POST', '/api/delegasi', tok.atasan1,
  { ke_pengguna_id: uid.atasan2, mulai: hariIni, selesai: besok, alasan: 'Cuti tahunan' });
cek('Atasan 1 boleh mendelegasikan ke Atasan 2', r.status === 200, r.data.pesan);

r = await j('POST', '/api/delegasi', tok.atasan2,
  { ke_pengguna_id: uid.atasan1, mulai: hariIni, selesai: besok, alasan: 'Coba ke bawah' });
cek('delegasi ke bawah ditolak', r.status === 400, r.data.pesan);

r = await j('POST', '/api/delegasi', tok.finance,
  { ke_pengguna_id: uid.atasan3, mulai: hariIni, selesai: besok, alasan: 'Coba' });
cek('peran tanpa tujuan alami diarahkan ke Super Admin', r.status === 403, r.data.pesan);

r = await j('POST', '/api/delegasi/darurat', tok.superadmin,
  { dari_pengguna_id: uid.finance, ke_pengguna_id: uid.superadmin, mulai: hariIni, selesai: besok, alasan: 'Coba' });
cek('Super Admin tidak boleh jadi penerima delegasi', r.status === 400, r.data.pesan);

r = await j('POST', '/api/delegasi/darurat', tok.superadmin,
  { dari_pengguna_id: uid.finance, ke_pengguna_id: uid.atasan3, mulai: hariIni, selesai: besok, alasan: 'Finance sakit mendadak' });
cek('penunjukan darurat oleh Super Admin diterima', r.status === 200, r.data.pesan);

r = await j('POST', '/api/delegasi', tok.atasan1,
  { ke_pengguna_id: uid.atasan2, mulai: hariIni, selesai: besok, alasan: 'Tumpang tindih' });
cek('rentang tanggal bertumpang tindih ditolak', r.status === 409, r.data.pesan);

console.log('\n=== Bertindak lewat delegasi ===');
const wilayah = (await j('GET', '/api/master/wilayah', tok.admin)).data;
const kategori = (await j('GET', '/api/master/kategori', tok.admin)).data;
const pagu = (await j('GET', '/api/pagu/region?tahun=2026', tok.admin)).data
  .filter((x) => Number(x.tersedia) > 20_000_000).sort((a, b) => Number(b.tersedia) - Number(a.tersedia))[0];
const penerima_id = (await j('POST', '/api/master/penerima', tok.finance,
  { jenis: 'vendor', nama: 'PT Delegasi', bank: 'BCA', no_rekening: '999' })).data.id;
const dipakai = (await j('GET', '/api/laporan/serapan/kota?tahun=2026', tok.admin)).data.map((x) => Number(x.kota_id));
const kota = wilayah.filter((w) => w.region === pagu.region).find((w) => !dipakai.includes(Number(w.kota_id)));

const c = await j('POST', '/api/pengajuan', tok.admin, {
  kota_id: kota.kota_id, kategori_id: kategori.find((k) => k.nama === pagu.kategori).id,
  periode_tahun: 2026, periode_bulan: pagu.bulan, judul: 'Uji delegasi',
  tgl_mulai: '2026-06-01', tgl_selesai: '2026-06-10', penerima_id,
});
const id = c.data.id;
await j('PUT', `/api/pengajuan/${id}/item`, tok.admin, { item: [{ nama: 'x', qty: 1, harga_satuan: 5_000_000 }] });
await j('POST', `/api/pengajuan/${id}/submit`, tok.admin, { justifikasi_cost_ratio: 'x', alasan_melebihi_pagu: 'x' });

// Atasan 2 memegang delegasi dari Atasan 1, jadi boleh menindak antrean Atasan 1.
r = await j('POST', `/api/pengajuan/${id}/aksi`, tok.atasan2, { aksi: 'approve' });
cek('Atasan 2 dapat menindak antrean Atasan 1 lewat delegasi', r.status === 200, `status ${r.data.status}`);

const riwayat = (await j('GET', `/api/pengajuan/${id}`, tok.admin)).data.riwayat;
const lewatDelegasi = riwayat.find((x) => x.atas_nama);
cek('jejak menyebut dua nama', !!lewatDelegasi,
  lewatDelegasi ? `${lewatDelegasi.oleh} atas nama ${lewatDelegasi.atas_nama}` : '');

console.log('\n=== Notifikasi ===');
const n1 = (await j('GET', '/api/notifikasi', tok.atasan2)).data;
cek('Atasan 2 punya notifikasi', n1.notifikasi.length > 0, `${n1.belum_dibaca} belum dibaca`);
cek('notifikasi menyebut nomor pengajuan', n1.notifikasi.some((x) => !!x.nomor));
await j('POST', '/api/notifikasi/baca', tok.atasan2, {});
cek('penandaan sudah dibaca bekerja', (await j('GET', '/api/notifikasi', tok.atasan2)).data.belum_dibaca === 0);
const nAdmin = (await j('GET', '/api/notifikasi', tok.admin)).data;
cek('Admin tidak menerima notifikasi milik approver',
  nAdmin.notifikasi.every((x) => x.jenis !== 'perlu_persetujuan'), `${nAdmin.notifikasi.length} notifikasi`);

console.log('\n=== Antrean WhatsApp ===');
const a = (await j('GET', '/api/notifikasi/antrean', tok.superadmin)).data;
cek('status gateway terbaca', typeof a.gateway_aktif === 'boolean', `aktif=${a.gateway_aktif}`);
cek('tidak ada yang diantrekan saat gateway belum dikonfigurasi',
  a.gateway_aktif || (a.ringkas.length === 0), `${a.ringkas.length} kelompok status`);
cek('hanya Super Admin yang bisa melihat antrean',
  (await j('GET', '/api/notifikasi/antrean', tok.admin)).status === 403);

console.log('\n=== Pembatalan delegasi ===');
const daftar = (await j('GET', '/api/delegasi', tok.superadmin)).data;
cek('Super Admin melihat seluruh delegasi', daftar.length >= 2, `${daftar.length} delegasi`);
cek('penanda sedang aktif terhitung', daftar.some((x) => x.sedang_aktif));
r = await j('DELETE', `/api/delegasi/${daftar[0].id}`, tok.admin);
cek('orang lain tidak boleh membatalkan', r.status === 403);
r = await j('DELETE', `/api/delegasi/${daftar.find((x) => x.dari_peran === 'atasan_1').id}`, tok.atasan1);
cek('pemberi delegasi boleh membatalkan', r.status === 200, r.data.pesan);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
