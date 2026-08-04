import * as XLSX from 'xlsx';

/**
 * Membaca dan memvalidasi berkas master plan.
 *
 * Satu baris melanggar berarti seluruh unggahan ditolak. Menyimpan sebagian akan
 * menghasilkan master plan yang setengah valid, dan itu lebih berbahaya daripada
 * gagal unggah - tidak ada yang tahu bagian mana yang bisa dipercaya.
 *
 * Catatan teknis: cellDates sengaja tidak dipakai. Di zona Asia/Jakarta, parsing
 * tanggal SheetJS menggeser nilai sehari. Di berkas ini bulan memang disimpan
 * sebagai angka 1-12, jadi tidak ada tanggal yang perlu ditafsirkan sama sekali.
 */

const SHEET_REGION = 'Plafon Region';
const SHEET_AREA = 'Alokasi Area';

// Spasi berlebih pada judul kolom menghasilkan nilai nol tanpa peringatan.
// Seluruh kunci dipangkas sebelum dipakai.
const rapikan = (baris) =>
  Object.fromEntries(Object.entries(baris).map(([k, v]) => [String(k).trim(), typeof v === 'string' ? v.trim() : v]));

// Uang dibandingkan dalam satuan sen bulat. Membandingkan bilangan pecahan
// secara langsung akan memunculkan selisih semu di digit terakhir.
const sen = (v) => Math.round(Number(v) * 100);

export function bacaBerkasPlan(buffer, { tahun, region, area, kategori }) {
  const galat = [];
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  for (const s of [SHEET_REGION, SHEET_AREA])
    if (!wb.SheetNames.includes(s)) galat.push(`Sheet "${s}" tidak ditemukan di berkas.`);
  if (galat.length) return { ok: false, galat };

  const barisRegion = XLSX.utils.sheet_to_json(wb.Sheets[SHEET_REGION]).map(rapikan);
  const barisArea = XLSX.utils.sheet_to_json(wb.Sheets[SHEET_AREA]).map(rapikan);

  const petaRegion = new Map(region.map((r) => [r.nama.toLowerCase(), r]));
  const petaArea = new Map(area.map((a) => [a.nama.toLowerCase(), a]));
  const petaKategori = new Map(kategori.map((k) => [k.nama.toLowerCase(), k]));

  const cariNama = (peta, nilai, jenis, no) => {
    const k = String(nilai ?? '').trim().toLowerCase();
    const hit = peta.get(k);
    if (!hit) galat.push(`Baris ${no}: ${jenis} "${nilai}" tidak ada di master.`);
    return hit;
  };

  const cekBulan = (b, no) => {
    const n = Number(b);
    if (!Number.isInteger(n) || n < 1 || n > 12) { galat.push(`Baris ${no}: bulan "${b}" tidak sah, harus 1 sampai 12.`); return null; }
    return n;
  };

  const cekNominal = (v, no, kolom) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { galat.push(`Baris ${no}: kolom ${kolom} bernilai "${v}", harus angka tidak negatif.`); return null; }
    return n;
  };

  const plafon = [];
  barisRegion.forEach((b, i) => {
    const no = i + 2;
    const r = cariNama(petaRegion, b.Region, 'Region', no);
    const k = cariNama(petaKategori, b.Kategori, 'Kategori', no);
    const bl = cekBulan(b.Bulan, no);
    const n = cekNominal(b['Plafon (Rp)'] ?? b.Plafon, no, 'Plafon');
    if (r && k && bl && n !== null) plafon.push({ region_id: r.id, kategori_id: k.id, tahun, bulan: bl, plafon: n });
  });

  const alokasi = [];
  barisArea.forEach((b, i) => {
    const no = i + 2;
    const r = cariNama(petaRegion, b.Region, 'Region', no);
    const a = cariNama(petaArea, b.Area, 'Area', no);
    const k = cariNama(petaKategori, b.Kategori, 'Kategori', no);
    const bl = cekBulan(b.Bulan, no);
    const n = cekNominal(b['Alokasi (Rp)'] ?? b.Alokasi, no, 'Alokasi');
    if (r && a && k && bl && n !== null) {
      if (a.region_id !== r.id) galat.push(`Baris ${no}: area "${b.Area}" bukan bagian dari region "${b.Region}".`);
      else alokasi.push({ area_id: a.id, region_id: r.id, kategori_id: k.id, tahun, bulan: bl, alokasi: n });
    }
  });

  if (galat.length) return { ok: false, galat };

  // Kelengkapan: setiap region dan kategori harus punya dua belas bulan.
  const kunci = (x) => `${x.region_id}|${x.kategori_id}|${x.bulan}`;
  const adaPlafon = new Set(plafon.map(kunci));
  for (const r of region)
    for (const k of kategori)
      for (let b = 1; b <= 12; b++)
        if (!adaPlafon.has(`${r.id}|${k.id}|${b}`))
          galat.push(`Plafon region belum lengkap: ${r.nama} / ${k.nama} / bulan ${b}.`);

  const ganda = plafon.length - adaPlafon.size;
  if (ganda > 0) galat.push(`Ada ${ganda} baris plafon region yang ganda untuk kombinasi yang sama.`);

  // Balance: jumlah alokasi area harus persis sama dengan plafon region.
  const totalArea = new Map();
  for (const a of alokasi) totalArea.set(kunci(a), (totalArea.get(kunci(a)) ?? 0) + sen(a.alokasi));

  const namaRegion = new Map(region.map((r) => [r.id, r.nama]));
  const namaKategori = new Map(kategori.map((k) => [k.id, k.nama]));

  for (const p of plafon) {
    const jumlah = totalArea.get(kunci(p)) ?? 0;
    const selisih = sen(p.plafon) - jumlah;
    if (selisih !== 0)
      galat.push(
        `Tidak balance: ${namaRegion.get(p.region_id)} / ${namaKategori.get(p.kategori_id)} / bulan ${p.bulan} — ` +
        `plafon ${p.plafon.toLocaleString('id-ID')}, jumlah alokasi area ${(jumlah / 100).toLocaleString('id-ID')}, ` +
        `selisih ${(selisih / 100).toLocaleString('id-ID')}.`,
      );
  }

  if (galat.length) return { ok: false, galat: galat.slice(0, 50), jumlahGalat: galat.length };

  return {
    ok: true,
    plafon,
    alokasi,
    ringkasan: {
      barisPlafon: plafon.length,
      barisAlokasi: alokasi.length,
      totalPlafon: plafon.reduce((s, p) => s + sen(p.plafon), 0) / 100,
    },
  };
}
