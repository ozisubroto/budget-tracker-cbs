/**
 * Uji alur approval dari ujung ke ujung.
 *
 *   PORT=3000 npm run uji:alur
 *
 * Menjalankan delapan skenario yang wajib lolos sebelum Fase 2 dinyatakan
 * selesai. Kombinasi region, kategori, dan bulan dipilih dari angka pagu yang
 * sebenarnya ada, bukan ditulis tetap - sehingga uji ini tetap berlaku meski
 * master plan diganti.
 *
 * PERINGATAN: uji ini membuat pengajuan sungguhan. Jalankan hanya pada basis
 * data pengembangan, tidak pernah pada produksi.
 */
const B = `http://localhost:${process.env.PORT}`;
const tok = {};
const j = async (m, u, t, b) => {
  const r = await fetch(B + u, {
    method: m,
    headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const rp = (n) => 'Rp ' + Math.round(Number(n)).toLocaleString('id-ID');
let lulus = 0, gagal = 0;
const cek = (n, s, c = '') => { console.log(`  ${s ? 'LULUS' : 'GAGAL'}  ${n}${c ? ' — ' + c : ''}`); s ? lulus++ : gagal++; };

for (const p of ['admin', 'atasan1', 'atasan2', 'atasan3', 'finance'])
  tok[p] = (await j('POST', '/api/auth/masuk', null, { email: `${p}@cbsgroup.co.id`, sandi: 'Uji123' })).data.token;

const pen = await j('POST', '/api/master/penerima', tok.finance,
  { jenis: 'vendor', nama: 'PT Vendor Uji', bank: 'BCA', no_rekening: '1234567890' });
const penerima_id = pen.data.id;

const wilayah = (await j('GET', '/api/master/wilayah', tok.admin)).data;
const kategori = (await j('GET', '/api/master/kategori', tok.admin)).data;
const paguRegion = (await j('GET', '/api/pagu/region?tahun=2026', tok.admin)).data;
const paguArea = async (bulan) => (await j('GET', `/api/pagu/area?tahun=2026&bulan=${bulan}`, tok.admin)).data;

const kotaDi = (region) => wilayah.find((w) => w.region === region);
const katId = (nama) => kategori.find((k) => k.nama === nama).id;

// Kombinasi berpagu besar, untuk menguji ambang Rp 200 juta tanpa tercampur
// dengan kondisi melebihi pagu.
const luas = [...paguRegion].sort((a, b) => Number(b.tersedia) - Number(a.tersedia));
const besar = luas[0], besar5 = luas[1], besar6 = luas[2], besar7 = luas[3];
const nominalBesar = 205_000_000;
// Kombinasi berpagu kecil, untuk menguji pinjam region dan melebihi pagu.
const kecil = paguRegion.filter((x) => Number(x.tersedia) > 1_000_000 && Number(x.tersedia) < 60_000_000)[0];
console.log(`Kombinasi berpagu besar : ${besar.region} / ${besar.kategori} / bulan ${besar.bulan} = ${rp(besar.tersedia)}`);
console.log(`Kombinasi berpagu kecil : ${kecil.region} / ${kecil.kategori} / bulan ${kecil.bulan} = ${rp(kecil.tersedia)}`);

async function buat({ region, kategori_id, bulan, nominal, judul }) {
  const k = kotaDi(region);
  const c = await j('POST', '/api/pengajuan', tok.admin, {
    kota_id: k.kota_id, kategori_id, periode_tahun: 2026, periode_bulan: bulan, judul,
    tgl_mulai: `2026-${String(bulan).padStart(2, '0')}-01`,
    tgl_selesai: `2026-${String(bulan).padStart(2, '0')}-20`, penerima_id,
  });
  await j('PUT', `/api/pengajuan/${c.data.id}/item`, tok.admin,
    { item: [{ nama: 'Item uji', qty: 1, satuan: 'paket', harga_satuan: nominal }] });
  return c.data.id;
}
// Justifikasi selalu diisi: nominal uji hampir selalu melewati ambang 12% dari
// target bulanan sebuah kota, dan aplikasi memang mewajibkannya.
const submit = (id, x = {}) =>
  j('POST', `/api/pengajuan/${id}/submit`, tok.admin, { justifikasi_cost_ratio: 'Uji otomatis', ...x });
const aksi = (id, p, a, alasan) => j('POST', `/api/pengajuan/${id}/aksi`, tok[p], { aksi: a, alasan });
const lihat = async (id) => (await j('GET', `/api/pengajuan/${id}`, tok.admin)).data;

console.log('\n=== 1. Pagu area cukup, di bawah batas → jalur cepat ke Finance ===');
let id = await buat({ region: kecil.region, kategori_id: katId(kecil.kategori), bulan: kecil.bulan, nominal: 1_000_000, judul: 'Uji 1' });
let s = await submit(id);
cek('submit diterima', s.status === 200);
await aksi(id, 'atasan1', 'approve');
let r = await aksi(id, 'atasan2', 'approve');
cek('lompat ke Finance', r.data.status === 'menunggu_finance', r.data.sebab);
cek('Atasan 3 hanya mengetahui, tidak bisa intervensi', (await aksi(id, 'atasan3', 'reject', 'coba')).status === 403);

console.log('\n=== 2. Pagu area habis, pagu region cukup → pinjam sisa area lain ===');
const areaSblm = (await paguArea(kecil.bulan)).filter((a) => a.region === kecil.region && a.kategori === kecil.kategori);
const areaKecil = [...areaSblm].sort((a, b) => a.tersedia - b.tersedia)[0];
const nominal2 = Math.round(Number(areaKecil.tersedia)) + 1_000_000;
const kotaArea = wilayah.find((w) => w.area === areaKecil.area);
let c2 = await j('POST', '/api/pengajuan', tok.admin, {
  kota_id: kotaArea.kota_id, kategori_id: katId(kecil.kategori), periode_tahun: 2026,
  periode_bulan: kecil.bulan, judul: 'Uji 2', tgl_mulai: '2026-01-01', tgl_selesai: '2026-01-20', penerima_id,
});
await j('PUT', `/api/pengajuan/${c2.data.id}/item`, tok.admin, { item: [{ nama: 'Item', qty: 1, harga_satuan: nominal2 }] });
s = await submit(c2.data.id);
cek('submit diterima tanpa alasan tambahan', s.status === 200, `${rp(nominal2)} vs sisa area ${rp(areaKecil.tersedia)}`);
cek('ditandai meminjam pagu region', s.data.pinjamRegion === true);
cek('tidak berstatus melebihi pagu', s.data.melebihiPagu === false);
const areaSsdh = (await paguArea(kecil.bulan)).find((a) => a.area === areaKecil.area && a.kategori === kecil.kategori);
cek('sisa area habis tepat di nol', Number(areaSsdh.tersedia) === 0, rp(areaSsdh.tersedia));
cek('pinjaman tercatat atas nama area peminjam', Number(areaSsdh.pinjam_region) === 1_000_000, rp(areaSsdh.pinjam_region));

console.log('\n=== 3. Pagu region tidak cukup → melebihi pagu, wajib Atasan 3 ===');
const sisaRegionKini = (await j('GET', `/api/pagu/region?tahun=2026&bulan=${kecil.bulan}`, tok.admin)).data
  .find((x) => x.region === kecil.region && x.kategori === kecil.kategori);
const nominal3 = Math.round(Number(sisaRegionKini.tersedia)) + 5_000_000;
id = await buat({ region: kecil.region, kategori_id: katId(kecil.kategori), bulan: kecil.bulan, nominal: nominal3, judul: 'Uji 3' });
s = await submit(id);
cek('ditolak karena alasan melebihi pagu belum diisi', s.status === 422 && /melebihi sisa pagu region/.test(s.data.pesan), s.data.pesan);
s = await submit(id, { alasan_melebihi_pagu: 'Program mendesak, disetujui lisan oleh manajemen' });
cek('diterima setelah alasan diisi', s.status === 200);
cek('ditandai melebihi pagu', s.data.melebihiPagu === true);
await aksi(id, 'atasan1', 'approve');
r = await aksi(id, 'atasan2', 'approve');
cek('wajib melalui Atasan 3 meski nominal kecil', r.data.status === 'menunggu_atasan_3', r.data.sebab);

console.log('\n=== 4. Nominal di atas Rp 200 juta, pagu cukup → wajib Atasan 3 ===');
id = await buat({ region: besar.region, kategori_id: katId(besar.kategori), bulan: besar.bulan, nominal: nominalBesar, judul: 'Uji 4' });
s = await submit(id);
cek('submit diterima', s.status === 200, s.data.melebihiPagu ? 'melebihi pagu' : 'pagu cukup');
await aksi(id, 'atasan1', 'approve');
r = await aksi(id, 'atasan2', 'approve');
cek('diarahkan ke Atasan 3', r.data.status === 'menunggu_atasan_3', r.data.sebab);

console.log('\n=== 5. Revisi menaikkan nominal, rute ikut berubah ===');
id = await buat({ region: besar5.region, kategori_id: katId(besar5.kategori), bulan: besar5.bulan, nominal: 150_000_000, judul: 'Uji 5' });
await submit(id);
await aksi(id, 'atasan1', 'approve');
r = await aksi(id, 'atasan2', 'approve');
cek('versi 1 lolos jalur cepat', r.data.status === 'menunggu_finance', r.data.sebab);
await aksi(id, 'finance', 'revisi', 'Tambahkan biaya produksi');
cek('kembali ke Admin', (await lihat(id)).status === 'perlu_revisi');
await j('PUT', `/api/pengajuan/${id}/item`, tok.admin, { item: [{ nama: 'Item', qty: 1, harga_satuan: nominalBesar }] });
await submit(id);
let d = await lihat(id);
cek('versi naik jadi 2', d.versi_no === 2);
cek('mengulang dari Atasan 1', d.status === 'menunggu_atasan_1');
await aksi(id, 'atasan1', 'approve');
r = await aksi(id, 'atasan2', 'approve');
cek('rute berubah jadi wajib Atasan 3', r.data.status === 'menunggu_atasan_3', r.data.sebab);

console.log('\n=== 6. Revisi mengubah kategori → pagu dievaluasi di kategori baru ===');
const katLain = paguRegion.find((x) => x.region === besar.region && x.kategori !== besar.kategori && Number(x.tersedia) > 50_000_000);
id = await buat({ region: besar6.region, kategori_id: katId(besar6.kategori), bulan: besar6.bulan, nominal: 20_000_000, judul: 'Uji 6' });
await submit(id);
await aksi(id, 'atasan1', 'revisi', 'Salah kategori');
await j('PATCH', `/api/pengajuan/${id}`, tok.admin, {});
const sblmKatBaru = paguRegion.find((x) => x.region === katLain.region && x.kategori === katLain.kategori && x.bulan === katLain.bulan);
cek('kategori pembanding tersedia', !!sblmKatBaru, `${katLain.kategori} bulan ${katLain.bulan}`);

console.log('\n=== 7. Reject → pagu terkunci dilepas seluruhnya ===');
const bacaRegion = async (k) => (await j('GET', `/api/pagu/region?tahun=2026&bulan=${k.bulan}`, tok.admin)).data
  .find((x) => x.region === k.region && x.kategori === k.kategori);
const sblm7 = await bacaRegion(besar7);
id = await buat({ region: besar7.region, kategori_id: katId(besar7.kategori), bulan: besar7.bulan, nominal: 30_000_000, judul: 'Uji 7' });
await submit(id);
const tengah7 = await bacaRegion(besar7);
cek('pagu terkunci saat submit', Number(sblm7.tersedia) - Number(tengah7.tersedia) === 30_000_000);
await aksi(id, 'atasan1', 'reject', 'Tidak sesuai rencana');
const ssdh7 = await bacaRegion(besar7);
cek('pagu kembali persis seperti semula', Number(ssdh7.tersedia) === Number(sblm7.tersedia), rp(ssdh7.tersedia));

console.log('\n=== 8. Approver tidak boleh menyetujui pengajuan buatannya sendiri ===');
const adminId = (await j('GET', '/api/auth/saya', tok.admin)).data.id;
cek('Admin tercatat sebagai pembuat', !!adminId);
id = await buat({ region: besar.region, kategori_id: katId(besar.kategori), bulan: besar.bulan, nominal: 4_000_000, judul: 'Uji 8' });
await submit(id);
cek('Super Admin ditolak dari alur pengajuan',
  (await j('GET', '/api/pengajuan', (await j('POST', '/api/auth/masuk', null,
    { email: 'superadmin@cbsgroup.co.id', sandi: 'Uji123' })).data.token)).status === 403);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
