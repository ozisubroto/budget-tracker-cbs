import { q } from './db.js';

/**
 * Menghitung angka konteks yang ditampilkan ke approver, lalu dibekukan bersama
 * pengajuan.
 *
 * Di-snapshot, bukan ditarik ulang setiap layar dibuka. Tanpa ini, Atasan 1 yang
 * menyetujui hari Senin dan Atasan 3 yang menyetujui hari Kamis akan melihat cost
 * ratio berbeda untuk pengajuan yang sama, dan keputusan mereka tidak dapat
 * diaudit.
 *
 * Basisnya kota, dan Selling Out - bukan Selling In, yang bisa digelembungkan
 * oleh belanja promo yang sedang dinilai itu sendiri.
 */

// Tiga bulan sebelum periode budget yang diajukan, bukan sebelum tanggal submit.
// Pengajuan Oktober yang dibuat di Agustus tetap memakai Mei sampai Juli.
export function tigaBulanSebelum(tahun, bulan) {
  const hasil = [];
  for (let i = 1; i <= 3; i++) {
    let b = bulan - i, t = tahun;
    while (b < 1) { b += 12; t -= 1; }
    hasil.push({ tahun: t, bulan: b });
  }
  return hasil;
}

export async function ambilPengaturan() {
  const { rows } = await q(
    `SELECT DISTINCT ON (kode) kode, nilai FROM pengaturan
      WHERE status = 'berlaku' AND berlaku_sejak <= now()
      ORDER BY kode, berlaku_sejak DESC`,
  );
  return Object.fromEntries(rows.map((r) => [r.kode, Number(r.nilai)]));
}

export async function hitungSnapshot(klien, { kota_id, periode_tahun, periode_bulan, nominal, pengajuan_id = null }) {
  const db = klien ?? { query: q };
  const p = await ambilPengaturan();
  const bulanHistori = tigaBulanSebelum(periode_tahun, periode_bulan);

  const { rows: histori } = await db.query(
    `SELECT COALESCE(sum(selling_out), 0) AS total, count(*) AS jumlah_bulan
       FROM sales_kota_bulan
      WHERE kota_id = $1 AND (tahun, bulan) IN (($2,$3),($4,$5),($6,$7))`,
    [kota_id, ...bulanHistori.flatMap((b) => [b.tahun, b.bulan])],
  );

  const { rows: t } = await db.query(
    'SELECT target FROM sales_kota_bulan WHERE kota_id = $1 AND tahun = $2 AND bulan = $3',
    [kota_id, periode_tahun, periode_bulan],
  );

  // Budget kota yang sudah disetujui pada periode yang sama. Lima pengajuan
  // masing-masing dua persen terlihat aman satu per satu, padahal totalnya
  // sepuluh persen - baris kedua inilah yang membuat itu terlihat.
  const { rows: terpakaiKota } = await db.query(
    `SELECT COALESCE(sum(total_nominal), 0) AS jumlah
       FROM pengajuan
      WHERE kota_id = $1 AND periode_tahun = $2 AND periode_bulan = $3
        AND status NOT IN ('draft', 'ditolak', 'dibatalkan', 'perlu_revisi')
        AND ($4::bigint IS NULL OR id <> $4)`,
    [kota_id, periode_tahun, periode_bulan, pengajuan_id],
  );

  const jumlahBulan = Number(histori[0].jumlah_bulan);
  const total = Number(histori[0].total);
  const target = t.length && t[0].target !== null ? Number(t[0].target) : null;
  const n = Number(nominal);
  const kumulatif = Number(terpakaiKota[0].jumlah) + n;

  const rasioIni = target && target > 0 ? n / target : null;
  const rasioPeriode = target && target > 0 ? kumulatif / target : null;
  const ambang = p.ambang_cost_ratio ?? 0.12;

  // Target kosong diperlakukan sebagai melewati ambang. Pengajuan tanpa
  // pembanding justru lebih berisiko, bukan kurang.
  const wajibJustifikasi =
    target === null || target === 0 || rasioIni > ambang || rasioPeriode > ambang;

  return {
    snap_data_per: new Date(),
    snap_histori_total: total,
    snap_histori_rata2: jumlahBulan ? total / jumlahBulan : 0,
    snap_target: target,
    snap_cost_ratio_ini: rasioIni,
    snap_cost_ratio_periode: rasioPeriode,
    snap_ambang_cost_ratio: ambang,
    snap_batas_pagu: p.batas_pagu_atasan_2 ?? 0,
    wajibJustifikasi,
    bulanHistori,
    jumlahBulanTersedia: jumlahBulan,
  };
}
