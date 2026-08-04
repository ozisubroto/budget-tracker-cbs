-- Migrasi 003: mesin pagu sebagai view
--
-- Seluruh angka pagu di aplikasi berasal dari sini. Tidak ada layar atau laporan
-- yang boleh menghitung ulang dengan caranya sendiri - kalau itu terjadi, cepat
-- atau lambat akan muncul dua angka berbeda untuk hal yang sama, dan sejak saat
-- itu tidak ada yang percaya laporannya lagi.

BEGIN;

-- Bagian hold yang sudah benar-benar dibayar. Memisahkannya di sini menjaga
-- pembagian area dan region tetap utuh: satu pengajuan bisa memakai sebagian
-- alokasi areanya sendiri dan sebagian sisa region, dan proporsi itu tidak boleh
-- hilang saat pembayaran masuk.
ALTER TABLE pagu_hold
  ADD COLUMN IF NOT EXISTS nominal_terpakai NUMERIC(18,2) NOT NULL DEFAULT 0;

ALTER TABLE pagu_hold
  ADD CONSTRAINT ck_hold_terpakai CHECK (nominal_terpakai >= 0 AND nominal_terpakai <= nominal);

-- Versi master plan yang sedang berlaku, satu per tahun.
CREATE OR REPLACE VIEW v_plan_berlaku AS
  SELECT id AS versi_id, tahun FROM plan_versi WHERE status = 'berlaku';

-- Pagu tingkat region: plafon induk, angka resmi perusahaan.
-- Region adalah batas akuntansi keras - tidak ada mekanisme pinjam antar region.
CREATE OR REPLACE VIEW v_pagu_region AS
SELECT
  pr.region_id,
  pr.kategori_id,
  pr.tahun,
  pr.bulan,
  pr.plafon,
  COALESCE(h.terkunci, 0) AS terkunci,
  COALESCE(h.terpakai, 0) AS terpakai,
  pr.plafon - COALESCE(h.terkunci, 0) - COALESCE(h.terpakai, 0) AS tersedia
FROM plan_region pr
JOIN v_plan_berlaku v ON v.versi_id = pr.versi_id
LEFT JOIN (
  SELECT region_id, kategori_id, tahun, bulan,
         SUM(nominal - nominal_terpakai) FILTER (WHERE aktif) AS terkunci,
         SUM(nominal_terpakai)                                AS terpakai
  FROM pagu_hold
  GROUP BY region_id, kategori_id, tahun, bulan
) h ON h.region_id = pr.region_id AND h.kategori_id = pr.kategori_id
   AND h.tahun = pr.tahun AND h.bulan = pr.bulan;

-- Pagu tingkat area: alokasi turunan, acuan pembagian.
-- Boleh tertembus selama sisa region masih cukup, sehingga tersedia bisa negatif
-- di sini. Itu kondisi sah dan ditampilkan apa adanya sebagai ukuran disiplin.
CREATE OR REPLACE VIEW v_pagu_area AS
SELECT
  pa.area_id,
  a.region_id,
  pa.kategori_id,
  pa.tahun,
  pa.bulan,
  pa.alokasi,
  COALESCE(h.terkunci, 0) AS terkunci,
  COALESCE(h.terpakai, 0) AS terpakai,
  pa.alokasi - COALESCE(h.terkunci, 0) - COALESCE(h.terpakai, 0) AS tersedia
FROM plan_area pa
JOIN area a ON a.id = pa.area_id
JOIN v_plan_berlaku v ON v.versi_id = pa.versi_id
LEFT JOIN (
  SELECT area_id, kategori_id, tahun, bulan,
         SUM(nominal - nominal_terpakai) FILTER (WHERE aktif) AS terkunci,
         SUM(nominal_terpakai)                                AS terpakai
  FROM pagu_hold
  WHERE tingkat = 'area'
  GROUP BY area_id, kategori_id, tahun, bulan
) h ON h.area_id = pa.area_id AND h.kategori_id = pa.kategori_id
   AND h.tahun = pa.tahun AND h.bulan = pa.bulan;

COMMIT;
