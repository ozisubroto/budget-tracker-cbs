import { q } from './db.js';

/**
 * Mesin pagu.
 *
 * Cek bertingkat saat pengajuan disubmit:
 *   1. sisa alokasi area cukup            -> normal, potong pagu area
 *   2. sisa pagu region cukup             -> normal, kekurangan dari sisa area lain
 *   3. selain itu                         -> melebihi pagu, wajib lewat Atasan 3
 *
 * Region tidak dapat meminjam dari region lain. Itu batas akuntansi keras, agar
 * KPI antar region tidak saling mengganggu.
 */
export async function periksaPagu({ area_id, region_id, kategori_id, tahun, bulan, nominal }) {
  const [{ rows: ar }, { rows: rg }] = await Promise.all([
    q(`SELECT alokasi, terkunci, terpakai, tersedia FROM v_pagu_area
        WHERE area_id = $1 AND kategori_id = $2 AND tahun = $3 AND bulan = $4`,
      [area_id, kategori_id, tahun, bulan]),
    q(`SELECT plafon, terkunci, terpakai, tersedia FROM v_pagu_region
        WHERE region_id = $1 AND kategori_id = $2 AND tahun = $3 AND bulan = $4`,
      [region_id, kategori_id, tahun, bulan]),
  ]);

  if (!rg.length)
    return { ok: false, alasan: 'plan_tidak_ada', pesan: 'Master plan untuk periode dan kategori ini belum tersedia.' };

  const n = Number(nominal);
  const sisaArea = Number(ar[0]?.tersedia ?? 0);
  const sisaRegion = Number(rg[0].tersedia);

  // Yang dikunci di area hanya sebatas yang benar-benar tersedia di sana.
  // Sisanya dikunci di tingkat region, sehingga dua pengajuan dari dua area
  // berbeda tidak bisa sama-sama mengklaim sisa region yang sama.
  const dariArea = Math.max(0, Math.min(n, sisaArea));
  const dariRegion = n - dariArea;

  const melebihiPagu = n > sisaRegion;

  return {
    ok: true,
    melebihiPagu,
    pinjamRegion: !melebihiPagu && dariRegion > 0,
    kelebihan: melebihiPagu ? n - Math.max(0, sisaRegion) : 0,
    hold: [
      ...(dariArea > 0 ? [{ tingkat: 'area', area_id, region_id, nominal: dariArea }] : []),
      ...(dariRegion > 0 ? [{ tingkat: 'region', area_id: null, region_id, nominal: dariRegion }] : []),
    ],
    snapshot: {
      alokasi_area: ar[0]?.alokasi ?? null,
      sisa_area: sisaArea,
      plafon_region: rg[0].plafon,
      sisa_region: sisaRegion,
    },
  };
}

/** Mengunci pagu saat submit. Dipanggil di dalam transaksi pengajuan. */
export async function kunciPagu(c, pengajuan_id, kategori_id, tahun, bulan, hold) {
  for (const h of hold)
    await c.query(
      `INSERT INTO pagu_hold (pengajuan_id, tingkat, region_id, area_id, kategori_id, tahun, bulan, nominal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [pengajuan_id, h.tingkat, h.region_id, h.area_id, kategori_id, tahun, bulan, h.nominal],
    );
}

/** Melepas kunci saat pengajuan ditolak atau dibatalkan. */
export async function lepasPagu(c, pengajuan_id) {
  await c.query(
    `UPDATE pagu_hold SET aktif = FALSE, dilepas_pada = now()
      WHERE pengajuan_id = $1 AND aktif AND nominal_terpakai = 0`,
    [pengajuan_id],
  );
}
