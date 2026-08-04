import * as XLSX from 'xlsx';
import { ruteAman } from '../lib/rute.js';
import { q } from '../lib/db.js';
import { wajibLogin } from '../lib/auth.js';
import { serapanRegion, pengajuanPembentuk } from '../lib/laporan.js';

export const rute = ruteAman();
rute.use(wajibLogin);

const th = (req) => Number(req.query.tahun) || new Date().getFullYear();
const angka = (v) => (v === null || v === undefined ? null : Number(v));

// ------------------------------------------------------------ 1. serapan anggaran

rute.get('/serapan', async (req, res) => {
  res.json(await serapanRegion({
    tahun: th(req),
    bulan: req.query.bulan ? Number(req.query.bulan) : null,
    region_id: req.query.region_id ? Number(req.query.region_id) : null,
    versi_id: req.query.versi_id ? Number(req.query.versi_id) : null,
  }));
});

// Penelusuran ke tingkat area. Alokasi area adalah acuan pembagian; sisa yang
// negatif di sini sah dan ditampilkan apa adanya sebagai ukuran disiplin.
rute.get('/serapan/area', async (req, res) => {
  const { rows } = await q(
    `SELECT r.nama AS region, a.id AS area_id, a.nama AS area, k.nama AS kategori, v.bulan,
            v.alokasi, v.terkunci, v.terpakai, v.tersedia,
            COALESCE((SELECT sum(h.nominal) FROM pagu_hold h
                       WHERE h.tingkat = 'region' AND h.area_id = v.area_id AND h.kategori_id = v.kategori_id
                         AND h.tahun = v.tahun AND h.bulan = v.bulan AND h.aktif), 0) AS pinjam_region
       FROM v_pagu_area v
       JOIN area a ON a.id = v.area_id
       JOIN region r ON r.id = v.region_id
       JOIN kategori_budget k ON k.id = v.kategori_id
      WHERE v.tahun = $1 AND ($2::smallint IS NULL OR v.bulan = $2)
        AND ($3::bigint IS NULL OR v.region_id = $3)
      ORDER BY r.id, a.id, k.urutan, v.bulan`,
    [th(req), req.query.bulan ? Number(req.query.bulan) : null, req.query.region_id ? Number(req.query.region_id) : null],
  );
  res.json(rows);
});

// Pemakaian per kota. Kota tidak punya pagu sendiri - angkanya diturunkan dari
// pengajuan, dan itu cukup untuk melihat apakah satu kota menyerap pagu satu
// area sendirian.
rute.get('/serapan/kota', async (req, res) => {
  const { rows } = await q(
    `SELECT r.nama AS region, a.nama AS area, k.id AS kota_id, k.nama AS kota, kb.nama AS kategori,
            p.periode_bulan AS bulan,
            count(*) AS jumlah_pengajuan,
            sum(p.total_nominal) AS diajukan,
            COALESCE(sum(hh.terkunci), 0) AS terkunci,
            COALESCE(sum(hh.terpakai), 0) AS terpakai,
            s.target,
            CASE WHEN s.target > 0 THEN round(sum(p.total_nominal) / s.target * 100, 2) END AS cost_ratio_persen
       FROM pengajuan p
       JOIN kota k ON k.id = p.kota_id
       JOIN area a ON a.id = p.area_id
       JOIN region r ON r.id = p.region_id
       JOIN kategori_budget kb ON kb.id = p.kategori_id
       LEFT JOIN LATERAL (
         SELECT SUM(h.nominal - h.nominal_terpakai) FILTER (WHERE h.aktif) AS terkunci,
                SUM(h.nominal_terpakai) AS terpakai
           FROM pagu_hold h WHERE h.pengajuan_id = p.id) hh ON TRUE
       LEFT JOIN sales_kota_bulan s
              ON s.kota_id = p.kota_id AND s.tahun = p.periode_tahun AND s.bulan = p.periode_bulan
      WHERE p.periode_tahun = $1
        AND p.status NOT IN ('draft', 'ditolak', 'dibatalkan')
        AND ($2::smallint IS NULL OR p.periode_bulan = $2)
        AND ($3::bigint IS NULL OR p.region_id = $3)
      GROUP BY r.nama, r.id, a.nama, a.id, k.id, k.nama, kb.nama, kb.urutan, p.periode_bulan, s.target
      ORDER BY r.id, a.id, k.nama, kb.urutan, p.periode_bulan`,
    [th(req), req.query.bulan ? Number(req.query.bulan) : null, req.query.region_id ? Number(req.query.region_id) : null],
  );
  res.json(rows);
});

// Setiap angka harus bisa diklik sampai daftar pengajuan pembentuknya. Angka yang
// tidak bisa ditelusuri akan selalu dipertanyakan.
rute.get('/serapan/pengajuan', async (req, res) => {
  const w = ['tahun', 'bulan', 'region_id', 'kategori_id'].filter((k) => !req.query[k]);
  if (w.length) return res.status(400).json({ pesan: `Parameter wajib: ${w.join(', ')}.` });
  res.json(await pengajuanPembentuk({
    tahun: Number(req.query.tahun), bulan: Number(req.query.bulan),
    region_id: Number(req.query.region_id), kategori_id: Number(req.query.kategori_id),
  }));
});

// ------------------------------------------------------------ 2. over-budget & pengecualian

rute.get('/pengecualian', async (req, res) => {
  const tahun = th(req);
  const semua = await serapanRegion({ tahun });
  const overBudget = semua.filter((x) => x.melebihi_pagu).map((x) => ({
    ...x, kelebihan: -angka(x.tersedia),
  }));

  const { rows: jalurCepat } = await q(
    `SELECT p.id, p.nomor, p.judul, p.total_nominal, p.periode_bulan AS bulan,
            k.nama AS kota, r.nama AS region, kb.nama AS kategori,
            (SELECT u.nama FROM pengajuan_log l JOIN pengguna u ON u.id = l.oleh
              WHERE l.pengajuan_id = p.id AND l.status_dari = 'menunggu_atasan_2' AND l.aksi = 'approve'
              ORDER BY l.waktu DESC LIMIT 1) AS disetujui_oleh
       FROM pengajuan p
       JOIN kota k ON k.id = p.kota_id JOIN region r ON r.id = p.region_id
       JOIN kategori_budget kb ON kb.id = p.kategori_id
      WHERE p.periode_tahun = $1 AND p.jalur_cepat
        AND p.status NOT IN ('ditolak', 'dibatalkan')
      ORDER BY p.id`,
    [tahun],
  );

  const { rows: melebihi } = await q(
    `SELECT p.id, p.nomor, p.judul, p.total_nominal, p.alasan_melebihi_pagu,
            k.nama AS kota, r.nama AS region, kb.nama AS kategori, p.periode_bulan AS bulan,
            (SELECT u.nama FROM pengajuan_log l JOIN pengguna u ON u.id = l.oleh
              WHERE l.pengajuan_id = p.id AND l.status_dari = 'menunggu_atasan_3' AND l.aksi = 'approve'
              ORDER BY l.waktu DESC LIMIT 1) AS disetujui_atasan_3
       FROM pengajuan p
       JOIN kota k ON k.id = p.kota_id JOIN region r ON r.id = p.region_id
       JOIN kategori_budget kb ON kb.id = p.kategori_id
      WHERE p.periode_tahun = $1 AND p.melebihi_pagu AND p.status NOT IN ('ditolak', 'dibatalkan')
      ORDER BY p.id`,
    [tahun],
  );

  res.json({
    tahun,
    kombinasi_melebihi_plafon: overBudget,
    total_kelebihan: overBudget.reduce((s, x) => s + x.kelebihan, 0),
    pengajuan_melebihi_pagu: melebihi,
    pengajuan_jalur_cepat: jalurCepat,
    ringkas: {
      kombinasi_jebol: overBudget.length,
      lolos_tanpa_atasan_3: jalurCepat.length,
      nilai_jalur_cepat: jalurCepat.reduce((s, x) => s + Number(x.total_nominal), 0),
    },
  });
});

// ------------------------------------------------------------ 3. disiplin LPJ

rute.get('/lpj', async (req, res) => {
  const tahun = th(req);
  const { rows: perKota } = await q(
    `SELECT r.nama AS region, k.nama AS kota,
            count(*) AS wajib_lpj,
            count(*) FILTER (WHERE p.status_lpj = 'disetujui') AS selesai,
            count(*) FILTER (WHERE p.batas_lpj < CURRENT_DATE
                             AND p.status_lpj IN ('belum_dibuat','draft','perlu_revisi')) AS menunggak,
            round(avg(EXTRACT(day FROM l.diverifikasi_pada - p.tgl_selesai))
                  FILTER (WHERE p.status_lpj = 'disetujui'), 1) AS rata_hari_selesai,
            COALESCE(sum(l.total_terpakai), 0) AS total_terpakai,
            COALESCE(sum(l.sisa_dana), 0) AS total_sisa_dikembalikan
       FROM pengajuan p
       JOIN kota k ON k.id = p.kota_id
       JOIN region r ON r.id = p.region_id
       LEFT JOIN lpj l ON l.pengajuan_id = p.id
      WHERE p.periode_tahun = $1 AND p.batas_lpj IS NOT NULL
      GROUP BY r.id, r.nama, k.nama ORDER BY menunggak DESC, r.id, k.nama`,
    [tahun],
  );

  const { rows: menunggak } = await q(
    `SELECT p.id, p.nomor, p.judul, k.nama AS kota, r.nama AS region, p.total_nominal,
            p.batas_lpj, (CURRENT_DATE - p.batas_lpj) AS telat_hari, p.status_lpj
       FROM pengajuan p JOIN kota k ON k.id = p.kota_id JOIN region r ON r.id = p.region_id
      WHERE p.periode_tahun = $1 AND p.batas_lpj < CURRENT_DATE
        AND p.status_lpj IN ('belum_dibuat','draft','perlu_revisi')
      ORDER BY telat_hari DESC`,
    [tahun],
  );

  // Selisih rencana terhadap realisasi per item - yang mengungkap kota yang rutin
  // mengajukan besar tapi terpakainya jauh lebih kecil.
  const { rows: selisih } = await q(
    `SELECT r.nama AS region, k.nama AS kota,
            sum(i.subtotal) AS rencana, sum(li.subtotal_aktual) AS realisasi,
            sum(i.subtotal - li.subtotal_aktual) AS selisih,
            CASE WHEN sum(i.subtotal) > 0
                 THEN round(sum(li.subtotal_aktual) / sum(i.subtotal) * 100, 1) END AS penyerapan_persen
       FROM lpj l
       JOIN pengajuan p ON p.id = l.pengajuan_id
       JOIN kota k ON k.id = p.kota_id JOIN region r ON r.id = p.region_id
       JOIN lpj_item li ON li.lpj_id = l.id
       JOIN pengajuan_item i ON i.id = li.pengajuan_item_id
      WHERE p.periode_tahun = $1 AND l.status = 'disetujui'
      GROUP BY r.id, r.nama, k.nama ORDER BY selisih DESC`,
    [tahun],
  );

  res.json({ tahun, per_kota: perKota, menunggak, selisih_rencana_realisasi: selisih });
});

// ------------------------------------------------------------ 4. kecepatan approval

// Dihitung dari log perpindahan status. Angka ini yang menunjukkan di mana alur
// sebenarnya tersendat, dan hasilnya sering mengejutkan.
rute.get('/kecepatan', async (req, res) => {
  const tahun = th(req);
  const { rows: perTahap } = await q(
    `WITH langkah AS (
       SELECT l.pengajuan_id, l.status_dari AS tahap, l.waktu,
              lag(l.waktu) OVER (PARTITION BY l.pengajuan_id ORDER BY l.waktu) AS waktu_masuk
         FROM pengajuan_log l
         JOIN pengajuan p ON p.id = l.pengajuan_id
        WHERE p.periode_tahun = $1 AND l.aksi IN ('submit','approve','revisi','reject','bayar')
     )
     SELECT tahap,
            count(*) AS jumlah,
            round(avg(EXTRACT(epoch FROM waktu - waktu_masuk) / 86400)::numeric, 2) AS rata_hari,
            round(max(EXTRACT(epoch FROM waktu - waktu_masuk) / 86400)::numeric, 2) AS terlama_hari
       FROM langkah
      WHERE waktu_masuk IS NOT NULL AND tahap IS NOT NULL
      GROUP BY tahap ORDER BY rata_hari DESC NULLS LAST`,
    [tahun],
  );

  const { rows: menggantung } = await q(
    `SELECT p.id, p.nomor, p.judul, p.status, p.total_nominal, k.nama AS kota, r.nama AS region,
            EXTRACT(day FROM now() - COALESCE(
              (SELECT max(waktu) FROM pengajuan_log l WHERE l.pengajuan_id = p.id), p.dibuat_pada))::int AS umur_hari
       FROM pengajuan p JOIN kota k ON k.id = p.kota_id JOIN region r ON r.id = p.region_id
      WHERE p.periode_tahun = $1
        AND p.status IN ('menunggu_atasan_1','menunggu_atasan_2','menunggu_atasan_3','menunggu_finance')
      ORDER BY umur_hari DESC`,
    [tahun],
  );

  const { rows: total } = await q(
    `SELECT round(avg(EXTRACT(epoch FROM p.selesai_pada - p.disubmit_pada) / 86400)::numeric, 2) AS rata_hari_total,
            count(*) FILTER (WHERE p.selesai_pada IS NOT NULL) AS jumlah_selesai
       FROM pengajuan p WHERE p.periode_tahun = $1`,
    [tahun],
  );

  res.json({ tahun, per_tahap: perTahap, menggantung, ...total[0] });
});

// ------------------------------------------------------------ ekspor Excel

const kirimExcel = (res, nama, sheet) => {
  const wb = XLSX.utils.book_new();
  for (const [judul, baris] of Object.entries(sheet))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(baris.length ? baris : [{ info: 'tidak ada data' }]), judul.slice(0, 31));
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('content-disposition', `attachment; filename="${nama}.xlsx"`);
  res.send(buf);
};

// Angka ini akan dibawa ke rapat dan diolah lagi - ekspor bukan pelengkap.
rute.get('/:nama/excel', async (req, res) => {
  const tahun = th(req);
  switch (req.params.nama) {
    case 'serapan':
      return kirimExcel(res, `serapan-${tahun}`, { 'Serapan Region': await serapanRegion({ tahun }) });
    case 'pengecualian': {
      const d = (await fetchDiri(req, `/api/laporan/pengecualian?tahun=${tahun}`)) ?? {};
      return kirimExcel(res, `pengecualian-${tahun}`, {
        'Melebihi Plafon': d.kombinasi_melebihi_plafon ?? [],
        'Pengajuan Melebihi': d.pengajuan_melebihi_pagu ?? [],
        'Jalur Cepat': d.pengajuan_jalur_cepat ?? [],
      });
    }
    default:
      return res.status(404).json({ pesan: 'Laporan tidak dikenal. Pilihan: serapan, pengecualian.' });
  }
});

async function fetchDiri(req, jalur) {
  const r = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}${jalur}`, {
    headers: { authorization: req.headers.authorization },
  });
  return r.ok ? r.json() : null;
}
