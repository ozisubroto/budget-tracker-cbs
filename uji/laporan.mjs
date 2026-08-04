/**
 * Uji laporan.
 *
 *   PORT=3000 npm run uji:laporan
 *
 * Yang diperiksa bukan sekadar endpoint membalas, melainkan konsistensinya:
 * total laporan harus sama persis dengan penjumlahan pengajuan pembentuknya.
 * Laporan yang angkanya tidak bisa ditelusuri akan selalu dipertanyakan.
 */
const B = `http://localhost:${process.env.PORT}`;
const j = async (u, t) => {
  const r = await fetch(B + u, { headers: { authorization: `Bearer ${t}` } });
  return { status: r.status, data: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.arrayBuffer() };
};
const rp = (n) => 'Rp ' + Math.round(Number(n)).toLocaleString('id-ID');
let lulus = 0, gagal = 0;
const cek = (n, s, c = '') => { console.log(`  ${s ? 'LULUS' : 'GAGAL'}  ${n}${c ? ' — ' + c : ''}`); s ? lulus++ : gagal++; };

const tok = (await (await fetch(`${B}/api/auth/masuk`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'atasan3@cbsgroup.co.id', sandi: 'Uji123' }),
})).json()).token;

console.log('\n=== Serapan anggaran ===');
const serapan = (await j('/api/laporan/serapan?tahun=2026', tok)).data;
cek('mengembalikan 480 kombinasi', serapan.length === 480, `${serapan.length} baris`);
const totalPlafon = serapan.reduce((s, x) => s + Number(x.plafon), 0);
cek('total plafon sama dengan master plan', Math.round(totalPlafon) === 16_620_639_000, rp(totalPlafon));
const identitas = serapan.every((x) =>
  Math.round((Number(x.plafon) - Number(x.terkunci) - Number(x.terpakai) - Number(x.tersedia)) * 100) === 0);
cek('plafon − terkunci − terpakai = tersedia berlaku di semua baris', identitas);

console.log('\n=== Penelusuran ke pengajuan pembentuk ===');
const terpakaiAda = serapan.filter((x) => Number(x.terkunci) + Number(x.terpakai) > 0);
cek('ada kombinasi yang sudah terpakai', terpakaiAda.length > 0, `${terpakaiAda.length} kombinasi`);
let cocok = 0, beda = 0;
for (const sel of terpakaiAda) {
  const d = (await j(`/api/laporan/serapan/pengajuan?tahun=2026&bulan=${sel.bulan}&region_id=${sel.region_id}&kategori_id=${sel.kategori_id}`, tok)).data;
  const jml = d.reduce((s, x) => s + Number(x.terkunci) + Number(x.terpakai), 0);
  Math.round(jml * 100) === Math.round((Number(sel.terkunci) + Number(sel.terpakai)) * 100) ? cocok++ : beda++;
}
cek('setiap sel sama persis dengan jumlah pengajuan pembentuknya', beda === 0, `${cocok} cocok, ${beda} beda`);

console.log('\n=== Serapan tingkat area dan kota ===');
const area = (await j('/api/laporan/serapan/area?tahun=2026', tok)).data;
cek('area mengembalikan 1.056 baris', area.length === 1056, `${area.length} baris`);
const totalAlokasi = area.reduce((s, x) => s + Number(x.alokasi), 0);
cek('jumlah alokasi area sama dengan plafon region', Math.round(totalAlokasi) === Math.round(totalPlafon), rp(totalAlokasi));
const kota = (await j('/api/laporan/serapan/kota?tahun=2026', tok)).data;
cek('pemakaian per kota tersedia', Array.isArray(kota) && kota.length > 0, `${kota.length} baris`);
cek('cost ratio per kota terhitung', kota.some((x) => x.cost_ratio_persen !== null));

console.log('\n=== Over-budget dan pengecualian ===');
const p = (await j('/api/laporan/pengecualian?tahun=2026', tok)).data;
cek('daftar jalur cepat terisi', p.ringkas.lolos_tanpa_atasan_3 > 0, `${p.ringkas.lolos_tanpa_atasan_3} pengajuan, ${rp(p.ringkas.nilai_jalur_cepat)}`);
cek('penyetuju jalur cepat tercatat', p.pengajuan_jalur_cepat.every((x) => !!x.disetujui_oleh));
cek('pengajuan melebihi pagu punya alasan',
  p.pengajuan_melebihi_pagu.every((x) => !!x.alasan_melebihi_pagu), `${p.pengajuan_melebihi_pagu.length} pengajuan`);

console.log('\n=== Disiplin LPJ ===');
const l = (await j('/api/laporan/lpj?tahun=2026', tok)).data;
cek('rekap per kota tersedia', l.per_kota.length > 0, `${l.per_kota.length} kota`);
cek('daftar menunggak terisi', l.menunggak.length > 0, `${l.menunggak.length} menunggak`);
cek('telat hari dihitung', l.menunggak.every((x) => Number(x.telat_hari) > 0));
cek('selisih rencana vs realisasi tersedia', Array.isArray(l.selisih_rencana_realisasi));

console.log('\n=== Kecepatan approval ===');
const k = (await j('/api/laporan/kecepatan?tahun=2026', tok)).data;
cek('rata-rata per tahap terhitung', k.per_tahap.length > 0, k.per_tahap.map((x) => `${x.tahap}=${x.rata_hari}h`).join(' '));
cek('jumlah pengajuan selesai terhitung', Number(k.jumlah_selesai) > 0, `${k.jumlah_selesai} selesai`);

console.log('\n=== Ekspor Excel ===');
const x1 = await j('/api/laporan/serapan/excel?tahun=2026', tok);
cek('serapan terunduh sebagai xlsx', x1.status === 200 && x1.data.byteLength > 5000, `${Math.round(x1.data.byteLength / 1024)} KB`);
const x2 = await j('/api/laporan/pengecualian/excel?tahun=2026', tok);
cek('pengecualian terunduh sebagai xlsx', x2.status === 200 && x2.data.byteLength > 1000, `${Math.round(x2.data.byteLength / 1024)} KB`);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
