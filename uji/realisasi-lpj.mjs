/**
 * Uji realisasi dan LPJ dari ujung ke ujung.
 *
 *   PORT=3000 npm run uji:realisasi
 *
 * Lima skenario yang wajib lolos sebelum Fase 3 dinyatakan selesai. Membuat
 * pengajuan sungguhan - jalankan hanya pada basis data pengembangan.
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

const mk = async (jenis, nama) =>
  (await j('POST', '/api/master/penerima', tok.finance,
    { jenis, nama, bank: jenis === 'kas' ? null : 'BCA', no_rekening: jenis === 'kas' ? null : '111222333' })).data.id;
const penVendor = await mk('vendor', 'PT Vendor Realisasi');
const penSales = await mk('reimburse_sales', 'Budi Sales');

const wilayah = (await j('GET', '/api/master/wilayah', tok.admin)).data;
const kategori = (await j('GET', '/api/master/kategori', tok.admin)).data;
const paguRegion = (await j('GET', '/api/pagu/region?tahun=2026', tok.admin)).data;
// Hanya region yang punya cukup banyak kota: tiap skenario butuh kota berbeda.
const jumlahKota = {};
for (const w of wilayah) jumlahKota[w.region] = (jumlahKota[w.region] ?? 0) + 1;
const luas = [...paguRegion]
  .filter((x) => Number(x.tersedia) > 35_000_000 && jumlahKota[x.region] >= 6)
  .sort((a, b) => Number(b.tersedia) - Number(a.tersedia));
const bacaRegion = async (k) => (await j('GET', `/api/pagu/region?tahun=2026&bulan=${k.bulan}`, tok.admin)).data
  .find((x) => x.region === k.region && x.kategori === k.kategori);

// Tiap skenario memakai kota berbeda. Pengajuan yang selesai tanpa LPJ membuat
// kotanya menunggak, dan kota menunggak diblokir dari pengajuan baru - itu
// perilaku yang benar, jadi ujinya yang harus menghindarinya.
const dipakai = new Set();
function kotaBaru(region) {
  const k = wilayah.filter((w) => w.region === region).find((w) => !dipakai.has(w.kota_id));
  dipakai.add(k.kota_id);
  return k;
}

async function sampaiRealisasi({ kombinasi, nominal, penerima_id, bulanProgram = 3, judul, kota: kotaPaksa }) {
  const kota = kotaPaksa ?? kotaBaru(kombinasi.region);
  const kat = kategori.find((k) => k.nama === kombinasi.kategori);
  const bl = String(bulanProgram).padStart(2, '0');
  const c = await j('POST', '/api/pengajuan', tok.admin, {
    kota_id: kota.kota_id, kategori_id: kat.id, periode_tahun: 2026, periode_bulan: kombinasi.bulan,
    judul, tgl_mulai: `2026-${bl}-01`, tgl_selesai: `2026-${bl}-20`, penerima_id,
  });
  const id = c.data.id;
  await j('PUT', `/api/pengajuan/${id}/item`, tok.admin, {
    item: [{ nama: 'Sewa lokasi', qty: 1, satuan: 'paket', harga_satuan: nominal * 0.6 },
           { nama: 'Material promosi', qty: 1, satuan: 'paket', harga_satuan: nominal * 0.4 }],
  });
  await j('POST', `/api/pengajuan/${id}/submit`, tok.admin,
    { justifikasi_cost_ratio: 'Uji otomatis', alasan_melebihi_pagu: 'Uji otomatis' });
  for (const [peran] of [['atasan1'], ['atasan2'], ['atasan3'], ['finance']]) {
    const d = (await j('GET', `/api/pengajuan/${id}`, tok.admin)).data;
    if (d.status === 'menunggu_realisasi') break;
    await j('POST', `/api/pengajuan/${id}/aksi`, tok[peran], { aksi: 'approve' });
  }
  return id;
}

console.log('\n=== 1. Pembayaran dua termin sampai lunas ===');
let id = await sampaiRealisasi({ kombinasi: luas[0], nominal: 20_000_000, penerima_id: penVendor, judul: 'Realisasi 1' });
let d = (await j('GET', `/api/pengajuan/${id}`, tok.admin)).data;
cek('sampai menunggu realisasi', d.status === 'menunggu_realisasi');
cek('batas LPJ terisi otomatis', !!d.batas_lpj, d.batas_lpj);
let r = await j('POST', `/api/pengajuan/${id}/bayar`, tok.finance,
  { tanggal: '2026-03-25', nominal: 8_000_000, metode: 'transfer', no_referensi: 'TRF-001' });
cek('termin pertama tercatat', r.data.status === 'realisasi_sebagian', `sisa ${rp(r.data.sisa)}`);
r = await j('POST', `/api/pengajuan/${id}/bayar`, tok.finance,
  { tanggal: '2026-03-28', nominal: 12_000_000, metode: 'transfer', no_referensi: 'TRF-002' });
cek('lunas pada termin terakhir', r.data.status === 'selesai', `sisa ${rp(r.data.sisa)}`);

console.log('\n=== 2. Membayar melebihi nominal disetujui → ditolak ===');
id = await sampaiRealisasi({ kombinasi: luas[1], nominal: 12_000_000, penerima_id: penVendor, judul: 'Realisasi 2' });
r = await j('POST', `/api/pengajuan/${id}/bayar`, tok.finance,
  { tanggal: '2026-03-25', nominal: 18_000_000, metode: 'transfer' });
cek('ditolak dengan penjelasan angkanya', r.status === 422, r.data.pesan);
r = await j('POST', `/api/pengajuan/${id}/bayar`, tok.finance,
  { tanggal: '2026-03-25', nominal: 7_000_000, metode: 'transfer' });
cek('pembayaran wajar diterima', r.status === 200);
r = await j('POST', `/api/pengajuan/${id}/bayar`, tok.finance,
  { tanggal: '2026-03-26', nominal: 6_000_000, metode: 'transfer' });
cek('termin yang melebihi sisa juga ditolak', r.status === 422, r.data.pesan);

console.log('\n=== 3. Vendor invoice lebih kecil → ditutup, selisih kembali ke pagu ===');
const sblm3 = await bacaRegion(luas[2]);
id = await sampaiRealisasi({ kombinasi: luas[2], nominal: 18_000_000, penerima_id: penVendor, judul: 'Realisasi 3' });
await j('POST', `/api/pengajuan/${id}/bayar`, tok.finance,
  { tanggal: '2026-03-25', nominal: 13_000_000, metode: 'transfer', no_referensi: 'INV-88' });
r = await j('POST', `/api/pengajuan/${id}/tutup`, tok.finance, {});
cek('ditolak karena alasan belum diisi', r.status === 422, r.data.pesan);
r = await j('POST', `/api/pengajuan/${id}/tutup`, tok.finance, { alasan: 'Invoice vendor lebih rendah dari penawaran' });
cek('ditutup setelah alasan diisi', r.status === 200, `dilepas ${rp(r.data.dilepas)}`);
const ssdh3 = await bacaRegion(luas[2]);
cek('pagu berkurang hanya sebesar yang dibayar',
  Math.round(Number(sblm3.tersedia) - Number(ssdh3.tersedia)) === 13_000_000,
  `${rp(sblm3.tersedia)} → ${rp(ssdh3.tersedia)}`);

console.log('\n=== 4. Reimburse dibayar penuh, LPJ terpakai lebih kecil ===');
const sblm4 = await bacaRegion(luas[3]);
id = await sampaiRealisasi({ kombinasi: luas[3], nominal: 15_000_000, penerima_id: penSales, judul: 'Realisasi 4' });
r = await j('POST', `/api/pengajuan/${id}/tutup`, tok.finance, { alasan: 'coba' });
cek('reimburse tidak boleh ditutup di bawah nominal', r.status === 409, r.data.pesan);
await j('POST', `/api/pengajuan/${id}/bayar`, tok.finance, { tanggal: '2026-03-25', nominal: 15_000_000, metode: 'transfer' });
const item = (await j('GET', `/api/pengajuan/${id}`, tok.admin)).data.item;
r = await j('POST', `/api/lpj/${id}`, tok.admin, {
  item: [{ pengajuan_item_id: item[0].id, qty_aktual: 1, harga_aktual: 8_000_000 },
         { pengajuan_item_id: item[1].id, qty_aktual: 1, harga_aktual: 3_000_000 }],
});
cek('LPJ ditolak karena bukti setor belum ada', r.status === 422, r.data.pesan);
r = await j('POST', `/api/lpj/${id}`, tok.admin, {
  bukti_setor: 'setor-001.jpg',
  item: [{ pengajuan_item_id: item[0].id, qty_aktual: 1, harga_aktual: 8_000_000 },
         { pengajuan_item_id: item[1].id, qty_aktual: 1, harga_aktual: 3_000_000 }],
});
cek('LPJ terkirim', r.status === 200, `terpakai ${rp(r.data.total_terpakai)}, sisa ${rp(r.data.sisa_dana)}`);
cek('LPJ tidak dapat ditolak, hanya revisi',
  (await j('POST', `/api/lpj/${id}/verifikasi`, tok.finance, { aksi: 'reject', alasan: 'x' })).status === 400);
const tengah4 = await bacaRegion(luas[3]);
r = await j('POST', `/api/lpj/${id}/verifikasi`, tok.finance, { aksi: 'approve' });
cek('LPJ disetujui', r.status === 200);
const ssdh4 = await bacaRegion(luas[3]);
cek('sisa dana kembali ke pagu setelah LPJ disetujui',
  Math.round(Number(ssdh4.tersedia) - Number(tengah4.tersedia)) === 4_000_000,
  `${rp(tengah4.tersedia)} → ${rp(ssdh4.tersedia)}`);
cek('total terpakai turun jadi nominal yang benar-benar dipakai',
  Math.round(Number(sblm4.tersedia) - Number(ssdh4.tersedia)) === 11_000_000);

console.log('\n=== 5. LPJ menunggak memblokir pengajuan baru dari kota itu ===');
const kota5 = kotaBaru(luas[4].region);
id = await sampaiRealisasi({ kombinasi: luas[4], nominal: 8_000_000, penerima_id: penVendor,
  bulanProgram: 1, judul: 'Realisasi 5', kota: kota5 });
await j('POST', `/api/pengajuan/${id}/bayar`, tok.finance, { tanggal: '2026-01-25', nominal: 8_000_000, metode: 'transfer' });
d = (await j('GET', `/api/pengajuan/${id}`, tok.admin)).data;
cek('batas LPJ sudah lewat', new Date(d.batas_lpj) < new Date(), d.batas_lpj);
const kotaSama = [...dipakai].length ? wilayah.find((w) => w.kota_id === d.kota_id) : null;
const katBaru = kategori.find((k) => k.nama === luas[4].kategori);
const baru = await j('POST', '/api/pengajuan', tok.admin, {
  kota_id: kota5.kota_id, kategori_id: katBaru.id, periode_tahun: 2026, periode_bulan: luas[4].bulan,
  judul: 'Harusnya diblokir', tgl_mulai: '2026-06-01', tgl_selesai: '2026-06-10', penerima_id: penVendor,
});
await j('PUT', `/api/pengajuan/${baru.data.id}/item`, tok.admin, { item: [{ nama: 'x', qty: 1, harga_satuan: 1_000_000 }] });
r = await j('POST', `/api/pengajuan/${baru.data.id}/submit`, tok.admin, { justifikasi_cost_ratio: 'x', alasan_melebihi_pagu: 'x' });
cek('pengajuan baru dari kota itu ditolak', r.status === 409, r.data.pesan);
const nunggak = (await j('GET', '/api/lpj?menunggak=1', tok.finance)).data;
cek('muncul di daftar menunggak', nunggak.some((x) => Number(x.id) === Number(id)), `${nunggak.length} pengajuan menunggak`);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
