import { q } from './db.js';

/**
 * Mesin agregasi. Satu-satunya tempat angka pagu dijumlahkan untuk laporan.
 *
 * Kalau tiap laporan menghitung sendiri, cepat atau lambat akan muncul dua angka
 * berbeda untuk hal yang sama - dan sejak saat itu tidak ada yang percaya
 * laporannya. Empat laporan di Fase 4 semuanya memanggil fungsi di berkas ini.
 */

/**
 * Serapan pagu region. Bila versi_id diisi, plafon diambil dari versi master
 * plan itu, bukan yang sedang berlaku - dipakai untuk membaca laporan "sesuai
 * plafon yang berlaku saat itu" setelah ada revisi retroaktif.
 */
export async function serapanRegion({ tahun, bulan = null, region_id = null, versi_id = null }) {
  const { rows } = await q(
    `WITH plan AS (
       SELECT pr.region_id, pr.kategori_id, pr.tahun, pr.bulan, pr.plafon
         FROM plan_region pr
         JOIN plan_versi pv ON pv.id = pr.versi_id
        WHERE pr.tahun = $1
          AND pv.id = COALESCE($4::bigint, (SELECT id FROM plan_versi WHERE tahun = $1 AND status = 'berlaku'))
     ), pakai AS (
       SELECT region_id, kategori_id, tahun, bulan,
              SUM(nominal - nominal_terpakai) FILTER (WHERE aktif) AS terkunci,
              SUM(nominal_terpakai) AS terpakai
         FROM pagu_hold WHERE tahun = $1 GROUP BY region_id, kategori_id, tahun, bulan
     )
     SELECT r.id AS region_id, r.nama AS region, k.id AS kategori_id, k.nama AS kategori, p.bulan,
            p.plafon,
            COALESCE(u.terkunci, 0) AS terkunci,
            COALESCE(u.terpakai, 0) AS terpakai,
            p.plafon - COALESCE(u.terkunci, 0) - COALESCE(u.terpakai, 0) AS tersedia,
            CASE WHEN p.plafon > 0
                 THEN round((COALESCE(u.terkunci,0) + COALESCE(u.terpakai,0)) / p.plafon * 100, 2) END AS serapan_persen,
            p.plafon - COALESCE(u.terkunci,0) - COALESCE(u.terpakai,0) < 0 AS melebihi_pagu
       FROM plan p
       JOIN region r ON r.id = p.region_id
       JOIN kategori_budget k ON k.id = p.kategori_id
       LEFT JOIN pakai u ON u.region_id = p.region_id AND u.kategori_id = p.kategori_id AND u.bulan = p.bulan
      WHERE ($2::smallint IS NULL OR p.bulan = $2)
        AND ($3::bigint IS NULL OR p.region_id = $3)
      ORDER BY r.id, k.urutan, p.bulan`,
    [tahun, bulan, region_id, versi_id],
  );
  return rows;
}

/** Penelusuran satu sel serapan ke daftar pengajuan pembentuknya. */
export async function pengajuanPembentuk({ tahun, bulan, region_id, kategori_id }) {
  const { rows } = await q(
    `SELECT p.id, p.nomor, p.judul, p.status, p.total_nominal, p.melebihi_pagu, p.jalur_cepat,
            k.nama AS kota, a.nama AS area,
            COALESCE(SUM(h.nominal - h.nominal_terpakai) FILTER (WHERE h.aktif), 0) AS terkunci,
            COALESCE(SUM(h.nominal_terpakai), 0) AS terpakai
       FROM pagu_hold h
       JOIN pengajuan p ON p.id = h.pengajuan_id
       JOIN kota k ON k.id = p.kota_id
       JOIN area a ON a.id = p.area_id
      WHERE h.tahun = $1 AND h.bulan = $2 AND h.region_id = $3 AND h.kategori_id = $4
      GROUP BY p.id, k.nama, a.nama
      ORDER BY p.id`,
    [tahun, bulan, region_id, kategori_id],
  );
  return rows;
}
