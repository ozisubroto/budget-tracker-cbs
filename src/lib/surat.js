import { LOGO_CBS } from './logo.js';

/**
 * Menyusun surat pengajuan budget siap cetak.
 *
 * Dirender di server, bukan di peramban. Alasannya: surat ini dokumen resmi
 * yang jadi lampiran persetujuan, jadi isinya harus berasal dari basis data
 * pada saat dicetak - bukan dari salinan yang kebetulan ada di layar pengguna.
 */

const ALAMAT = 'Pulau Maju Bersama Ruko RGIH No. 20-21,<br>Golf Island - Pantai Indah Kapuk, 14460';

const BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Seluruh teks dari pengguna dilewatkan ke sini sebelum masuk HTML. Judul
// program dan nama item diketik bebas oleh Admin; tanpa pengaman ini, satu
// tanda kurung siku bisa merusak tata letak surat resmi - atau lebih buruk.
const aman = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const rp = (n) => (n === null || n === undefined ? '—' : 'Rp ' + Math.round(Number(n)).toLocaleString('id-ID'));
const angka = (n) => (n === null || n === undefined ? '—' : Math.round(Number(n)).toLocaleString('id-ID'));
const persen = (n) => (n === null || n === undefined ? '—' : `${(Number(n) * 100).toFixed(1)}%`);

const tanggal = (d) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

const tanggalJam = (d) =>
  d ? new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(/\./g, '.') : '—';

/**
 * Menyusun lima kotak tanda tangan.
 *
 * Tahap yang belum ditindak sengaja dibiarkan kosong dan bergaris putus-putus -
 * tidak diberi tanda apa pun. Lembar yang dicetak di tengah alur harus jujur
 * menunjukkan mana yang benar-benar sudah diputuskan; kotak kosong yang mirip
 * kotak terisi mengundang orang menandatanganinya manual di atas kertas, dan
 * sejak saat itu catatan sistem dan lembar fisik bisa bercerita berbeda.
 *
 * Pengajuan yang lolos jalur cepat tidak melewati Atasan 3. Kotaknya ditandai
 * "tidak diperlukan", bukan "menunggu", supaya tidak ada yang mengira surat ini
 * belum lengkap.
 */
function kotakTtd({ peran, jabatan, nama, waktu, status, atasNama }) {
  const kelas = status === 'setuju' ? 'setuju' : status === 'lewat' ? 'lewat' : 'tunggu';
  const isi =
    status === 'setuju' ? `<span class="cap">✓ ${peran === 'Diajukan' ? 'Dikirim' : 'Disetujui'}</span>`
    : status === 'lewat' ? 'tidak diperlukan'
    : 'belum ditindak';
  return `
    <div class="ttd-kotak ${kelas}">
      <div class="peran">${aman(status === 'setuju' ? peran : status === 'lewat' ? 'Dilewati' : 'Menunggu')}</div>
      <div class="jabatan">${aman(jabatan)}</div>
      <div class="ttd-area">${isi}</div>
      <div class="nama">${aman(nama || '—')}</div>
      <div class="waktu">${waktu ? aman(tanggalJam(waktu)) : '—'}${
        atasNama ? `<br>atas nama ${aman(atasNama)}` : ''}</div>
    </div>`;
}

export function suratHtml({ p, item, ttd, dicetakOleh }) {
  const barisItem = item.map((i) => `
      <tr>
        <td><div class="nama">${aman(i.nama)}</div></td>
        <td class="ka num">${rp(i.harga_satuan)}</td>
        <td class="ka num">${angka(i.qty)}</td>
        <td class="ka">${aman(i.satuan || '—')}</td>
        <td class="ka num">${rp(i.subtotal)}</td>
      </tr>`).join('');

  const lewatAmbang = (v) =>
    v !== null && p.snap_ambang_cost_ratio !== null && Number(v) > Number(p.snap_ambang_cost_ratio);

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${aman(p.nomor)} — ${aman(p.kategori)}</title>
<style>
:root{--biru:#1E3A8A;--ink:#111827;--abu:#6B7280;--garis:#D9DCE3;--hijau:#15803D}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',Arial,sans-serif;background:#E9EAEE;
  color:var(--ink);padding:26px;font-size:11px;line-height:1.5;-webkit-font-smoothing:antialiased}
.kertas{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:16mm 15mm 14mm;
  box-shadow:0 6px 28px rgba(17,24,39,.14);display:flex;flex-direction:column}
.kepala{display:flex;align-items:flex-end;gap:18px;margin-bottom:22px}
.logo{width:112px;height:auto;display:block}
.nama-pt{font-size:14px;font-weight:800;letter-spacing:-.015em;margin-top:8px;color:var(--ink)}
.nama-pt span{display:block;font-size:9px;font-weight:500;color:var(--abu);line-height:1.5;margin-top:2px}
.judul{margin-left:auto;text-align:right}
.judul h1{font-size:25px;font-weight:700;color:var(--biru);letter-spacing:-.02em;line-height:1.1;text-transform:uppercase}
.judul .sub{font-size:10px;font-weight:600;color:var(--abu);margin-top:3px;letter-spacing:.08em;text-transform:uppercase}
.judul .no{font-size:12px;font-weight:700;margin-top:7px}
.judul .tgl{font-size:10px;color:var(--abu);font-weight:500}
.blok{display:flex;gap:30px;margin-bottom:20px}
.blok>div{flex:0 1 300px}
.blok h4{font-size:9.5px;font-weight:700;color:var(--biru);letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px}
.blok p{font-size:10px;line-height:1.65}
.blok .tebal{font-weight:600}
table{width:100%;border-collapse:collapse;margin-bottom:4px}
thead th{background:var(--biru);color:#fff;font-size:9px;font-weight:600;letter-spacing:.05em;
  text-transform:uppercase;padding:9px 10px;text-align:left}
thead th.ka{text-align:right}
tbody td{padding:10px;border-bottom:1px solid var(--garis);font-size:10px;vertical-align:top}
tbody td.ka{text-align:right;white-space:nowrap}
tbody .nama{font-weight:600;font-size:10.5px}
.num{font-variant-numeric:tabular-nums}
.total-bar{display:flex;margin-top:14px;gap:24px}
.catatan{flex:1;font-size:9.5px;color:var(--abu);line-height:1.6}
.catatan b{color:var(--ink);display:block;margin-bottom:3px;font-size:10px}
.total-kotak{width:250px;flex:none}
.total-baris{display:flex;justify-content:space-between;padding:5px 12px;font-size:10px}
.total-baris span:first-child{color:var(--abu);font-weight:500}
.total-baris span:last-child{font-weight:600}
.total-akhir{display:flex;justify-content:space-between;align-items:center;background:var(--biru);
  color:#fff;padding:11px 12px;border-radius:4px;margin-top:5px}
.total-akhir span:first-child{font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase}
.total-akhir span:last-child{font-size:14px;font-weight:700}
.konteks{margin-top:20px;border:1px solid var(--garis);border-radius:5px;padding:12px 14px}
.konteks h4{font-size:9.5px;font-weight:700;color:var(--biru);letter-spacing:.06em;text-transform:uppercase;margin-bottom:9px}
.konteks-isi{display:flex;gap:18px}
.konteks-isi>div{flex:1}
.konteks-isi .k{font-size:8.5px;color:var(--abu);font-weight:500;margin-bottom:1px}
.konteks-isi .v{font-size:10.5px;font-weight:600}
.konteks-isi .v.merah{color:#B91C1C}
.justifikasi{margin-top:10px;padding-top:9px;border-top:1px solid var(--garis);font-size:9.5px;color:var(--abu);line-height:1.6}
.justifikasi b{color:var(--ink)}
.ttd-judul{margin-top:22px;font-size:9.5px;font-weight:700;color:var(--biru);letter-spacing:.06em;
  text-transform:uppercase;margin-bottom:10px}
.ttd{display:flex;gap:10px}
.ttd-kotak{flex:1;border:1px solid var(--garis);border-radius:5px;padding:10px;min-height:112px;
  display:flex;flex-direction:column}
.ttd-kotak .peran{font-size:8.5px;font-weight:700;color:var(--biru);letter-spacing:.04em;text-transform:uppercase;line-height:1.3}
.ttd-kotak .jabatan{font-size:8.5px;color:var(--abu);margin-top:1px;line-height:1.35;min-height:22px}
.ttd-area{flex:1;display:flex;align-items:center;justify-content:center;padding:6px 0}
.ttd-kotak .nama{font-size:10px;font-weight:600;border-top:1px solid var(--ink);padding-top:4px;text-align:center}
.ttd-kotak .waktu{font-size:8px;color:var(--abu);text-align:center;margin-top:1px;line-height:1.4}
.ttd-kotak.setuju{border-color:#BBDFC8;background:#F5FBF7}
.cap{display:inline-flex;align-items:center;gap:4px;border:1.5px solid var(--hijau);color:var(--hijau);
  border-radius:3px;padding:3px 7px;font-size:8px;font-weight:700;letter-spacing:.04em;
  text-transform:uppercase;transform:rotate(-4deg)}
.ttd-kotak.tunggu .ttd-area,.ttd-kotak.lewat .ttd-area{color:#C2C6CF;font-size:8.5px;font-style:italic}
.ttd-kotak.tunggu .nama,.ttd-kotak.lewat .nama{border-top-style:dashed;border-top-color:var(--garis);color:#C2C6CF}
.tanda{display:inline-block;font-size:8.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  padding:3px 8px;border-radius:3px;margin-left:8px;vertical-align:middle}
.tanda.merah{background:#FDECEC;color:#B91C1C}
.tanda.biru{background:#EAF0FE;color:#1E40AF}
.kaki{margin-top:auto;padding-top:16px;border-top:2px solid var(--biru);display:flex;gap:26px}
.kaki>div{flex:1}
.kaki h5{font-size:9px;font-weight:700;color:var(--biru);letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px}
.kaki p{font-size:8.5px;color:var(--abu);line-height:1.65}
.kaki .baris{display:flex;gap:6px;font-size:8.5px;color:var(--abu)}
.kaki .baris span:first-child{width:52px;flex:none;color:#9AA1AD}
.cetak{max-width:210mm;margin:0 auto 14px;display:flex;gap:8px;align-items:center}
.cetak button{background:var(--biru);color:#fff;border:0;border-radius:999px;padding:9px 18px;
  font:inherit;font-size:11px;font-weight:600;cursor:pointer}
.cetak span{font-size:10.5px;color:#5B6272}
@media print{
  /* Peramban membuang warna latar saat mencetak demi menghemat tinta. Untuk
     dokumen resmi berkop, itu justru menghilangkan identitasnya - jadi diminta
     eksplisit agar dipertahankan. */
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
  body{background:#fff;padding:0}
  .kertas{box-shadow:none;margin:0;width:auto;min-height:auto;padding:14mm}
  .cetak{display:none}
  .ttd,.konteks{break-inside:avoid;page-break-inside:avoid}
  thead{display:table-header-group}
}
</style>
</head>
<body>

<div class="cetak">
  <button onclick="window.print()">Cetak / Simpan PDF</button>
  <span>${aman(p.nomor)} — dicetak dari Budget Tracker CBS</span>
</div>

<div class="kertas">

  <div class="kepala">
    <div>
      <img class="logo" src="data:image/png;base64,${LOGO_CBS}" alt="Logo PT. Cahaya Bintang Sempurna">
      <div class="nama-pt">PT. Cahaya Bintang Sempurna<span>${ALAMAT}</span></div>
    </div>
    <div class="judul">
      <h1>${aman(p.kategori)}</h1>
      <div class="sub">Pengajuan Budget</div>
      <div class="no">${aman(p.nomor)}${p.versi_no > 1 ? ` · versi ${p.versi_no}` : ''}</div>
      <div class="tgl">Diajukan ${aman(tanggal(p.disubmit_pada || p.dibuat_pada))}</div>
    </div>
  </div>

  <div class="blok">
    <div>
      <h4>Diajukan Untuk</h4>
      <p><span class="tebal">Kota ${aman(p.kota)}</span><br>
         Area ${aman(p.area)} &middot; Region ${aman(p.region)}<br>
         Periode anggaran: ${aman(BULAN[p.periode_bulan])} ${aman(p.periode_tahun)}</p>
    </div>
    <div>
      <h4>Dibayarkan Kepada</h4>
      <p><span class="tebal">${aman(p.penerima || 'belum dipilih')}</span><br>
         ${aman((p.jenis_penerima || '').replace(/_/g, ' ') || '—')}${
           p.no_rekening ? ` &middot; ${aman(p.bank)} ${aman(p.no_rekening)}` : ''}<br>
         ${p.tgl_dibutuhkan ? `Dibutuhkan sebelum ${aman(tanggal(p.tgl_dibutuhkan))}` : 'Tanggal kebutuhan tidak ditentukan'}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:46%">Rincian Item</th>
        <th class="ka">Harga Satuan</th>
        <th class="ka">Qty</th>
        <th class="ka">Satuan</th>
        <th class="ka">Subtotal</th>
      </tr>
    </thead>
    <tbody>${barisItem}</tbody>
  </table>

  <div class="total-bar">
    <div class="catatan">
      <b>Tujuan Program</b>
      ${aman(p.judul)}${p.tujuan ? `. ${aman(p.tujuan)}` : ''}
      ${p.lokasi ? `<br>Lokasi: ${aman(p.lokasi)}.` : ''}
      <br>Program berjalan ${aman(tanggal(p.tgl_mulai))} sampai ${aman(tanggal(p.tgl_selesai))}.
    </div>
    <div class="total-kotak">
      <div class="total-baris"><span>Jumlah ${item.length} baris rincian</span><span class="num">${rp(p.total_nominal)}</span></div>
      <div class="total-akhir"><span>Total Diajukan</span><span class="num">${rp(p.total_nominal)}</span></div>
    </div>
  </div>

  <div class="konteks">
    <h4>Konteks Keputusan — dibekukan saat pengajuan dikirim${
      p.snap_data_per ? ` (data per ${aman(tanggal(p.snap_data_per))})` : ''}
      ${p.melebihi_pagu ? '<span class="tanda merah">Melebihi pagu region</span>' : ''}
      ${p.jalur_cepat ? '<span class="tanda biru">Jalur cepat</span>' : ''}</h4>
    <div class="konteks-isi">
      <div><div class="k">Selling Out 3 bulan</div><div class="v num">${rp(p.snap_histori_total)}</div></div>
      <div><div class="k">Rata-rata per bulan</div><div class="v num">${rp(p.snap_histori_rata2)}</div></div>
      <div><div class="k">Target kota periode ini</div><div class="v num">${
        p.snap_target === null ? 'belum tersedia' : rp(p.snap_target)}</div></div>
      <div><div class="k">Cost ratio pengajuan ini</div><div class="v num${
        lewatAmbang(p.snap_cost_ratio_ini) ? ' merah' : ''}">${persen(p.snap_cost_ratio_ini)}</div></div>
      <div><div class="k">Cost ratio periode berjalan</div><div class="v num${
        lewatAmbang(p.snap_cost_ratio_periode) ? ' merah' : ''}">${persen(p.snap_cost_ratio_periode)}</div></div>
      <div><div class="k">Ambang berlaku</div><div class="v num">${persen(p.snap_ambang_cost_ratio)}</div></div>
    </div>
    ${p.justifikasi_cost_ratio ? `<div class="justifikasi">
      <b>Justifikasi cost ratio di atas ambang:</b> ${aman(p.justifikasi_cost_ratio)}</div>` : ''}
    ${p.alasan_melebihi_pagu ? `<div class="justifikasi">
      <b>Alasan melebihi pagu region:</b> ${aman(p.alasan_melebihi_pagu)}</div>` : ''}
  </div>

  <div class="ttd-judul">Persetujuan Berjenjang</div>
  <div class="ttd">${ttd.map(kotakTtd).join('')}</div>

  <div class="kaki">
    <div>
      <h5>Keabsahan Dokumen</h5>
      <p>Dicetak dari Budget Tracker CBS pada ${aman(tanggalJam(new Date()))} oleh ${aman(dicetakOleh)}.
         Sah tanpa tanda tangan basah; status persetujuan mengikuti catatan sistem.</p>
    </div>
    <div>
      <h5>Penelusuran</h5>
      <div class="baris"><span>Nomor</span><span>${aman(p.nomor)}</span></div>
      <div class="baris"><span>Versi</span><span>${aman(p.versi_no)}</span></div>
      <div class="baris"><span>Status</span><span>${aman((p.status || '').replace(/_/g, ' '))}</span></div>
    </div>
    <div>
      <h5>Catatan</h5>
      <p>Dokumen ini bukan bukti pembayaran. Pencairan dilakukan Finance setelah seluruh tahap
         persetujuan selesai, dan wajib dipertanggungjawabkan lewat LPJ.</p>
    </div>
  </div>

</div>
</body>
</html>`;
}
