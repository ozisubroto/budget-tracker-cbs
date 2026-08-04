import { ruteAman } from '../lib/rute.js';
import { q } from '../lib/db.js';
import { wajibLogin } from '../lib/auth.js';

export const rute = ruteAman();
rute.use(wajibLogin);

const periode = (req) => [Number(req.query.tahun), req.query.bulan ? Number(req.query.bulan) : null];

// Serapan pagu per region. Setiap angka dapat ditelusuri ke tingkat area lewat
// endpoint di bawahnya, lalu ke pengajuan satuan pada fase berikutnya.
rute.get('/region', async (req, res) => {
  const [tahun, bulan] = periode(req);
  if (!tahun) return res.status(400).json({ pesan: 'Parameter tahun wajib diisi.' });

  const { rows } = await q(
    `SELECT r.id AS region_id, r.nama AS region, k.id AS kategori_id, k.nama AS kategori,
            v.bulan, v.plafon, v.terkunci, v.terpakai, v.tersedia,
            CASE WHEN v.plafon > 0 THEN round((v.terkunci + v.terpakai) / v.plafon * 100, 2) ELSE NULL END AS serapan_persen,
            v.tersedia < 0 AS melebihi_pagu
       FROM v_pagu_region v
       JOIN region r          ON r.id = v.region_id
       JOIN kategori_budget k ON k.id = v.kategori_id
      WHERE v.tahun = $1 AND ($2::smallint IS NULL OR v.bulan = $2)
      ORDER BY r.id, k.urutan, v.bulan`,
    [tahun, bulan],
  );
  res.json(rows);
});

rute.get('/area', async (req, res) => {
  const [tahun, bulan] = periode(req);
  if (!tahun) return res.status(400).json({ pesan: 'Parameter tahun wajib diisi.' });

  const { rows } = await q(
    `SELECT r.nama AS region, a.id AS area_id, a.nama AS area, k.nama AS kategori,
            v.bulan, v.alokasi, v.terkunci, v.terpakai, v.tersedia
       FROM v_pagu_area v
       JOIN area a            ON a.id = v.area_id
       JOIN region r          ON r.id = v.region_id
       JOIN kategori_budget k ON k.id = v.kategori_id
      WHERE v.tahun = $1 AND ($2::smallint IS NULL OR v.bulan = $2)
        AND ($3::bigint IS NULL OR v.region_id = $3)
      ORDER BY r.id, a.id, k.urutan, v.bulan`,
    [tahun, bulan, req.query.region_id ? Number(req.query.region_id) : null],
  );
  res.json(rows);
});

// Ringkasan setahun, dipakai layar pemantauan dan nanti oleh laporan serapan.
rute.get('/ringkasan', async (req, res) => {
  const tahun = Number(req.query.tahun);
  if (!tahun) return res.status(400).json({ pesan: 'Parameter tahun wajib diisi.' });

  const { rows } = await q(
    `SELECT r.nama AS region,
            sum(v.plafon) AS plafon, sum(v.terkunci) AS terkunci,
            sum(v.terpakai) AS terpakai, sum(v.tersedia) AS tersedia
       FROM v_pagu_region v JOIN region r ON r.id = v.region_id
      WHERE v.tahun = $1 GROUP BY r.id, r.nama ORDER BY r.id`,
    [tahun],
  );
  const total = rows.reduce((s, r) => ({
    plafon: s.plafon + Number(r.plafon), terkunci: s.terkunci + Number(r.terkunci),
    terpakai: s.terpakai + Number(r.terpakai), tersedia: s.tersedia + Number(r.tersedia),
  }), { plafon: 0, terkunci: 0, terpakai: 0, tersedia: 0 });
  res.json({ tahun, per_region: rows, total });
});
