import { q } from './db.js';

/**
 * Memindahkan angka dari terkunci ke terpakai saat pembayaran masuk.
 *
 * Pembagian area dan region harus tetap utuh. Satu pengajuan bisa memakai
 * sebagian alokasi areanya sendiri dan sebagian sisa region; kalau pembayaran
 * dibebankan sembarangan, proporsi itu hilang dan laporan disiplin area jadi
 * salah. Karena itu pembayaran dibagi proporsional terhadap nominal tiap kunci,
 * dengan sisa pembulatan dilempar ke baris terakhir agar totalnya persis.
 */
export async function bebankanPembayaran(c, pengajuan_id, nominal) {
  const { rows: hold } = await c.query(
    'SELECT id, nominal, nominal_terpakai FROM pagu_hold WHERE pengajuan_id = $1 AND aktif ORDER BY tingkat, id',
    [pengajuan_id],
  );
  const sisaTotal = hold.reduce((s, h) => s + (Number(h.nominal) - Number(h.nominal_terpakai)), 0);
  if (sisaTotal <= 0) return;

  const sen = (v) => Math.round(Number(v) * 100);
  let sisaBeban = sen(nominal);

  for (const [i, h] of hold.entries()) {
    const ruang = sen(h.nominal) - sen(h.nominal_terpakai);
    if (ruang <= 0) continue;
    const bagian = i === hold.length - 1
      ? Math.min(sisaBeban, ruang)
      : Math.min(ruang, Math.round((sen(nominal) * ruang) / sen(sisaTotal)));
    if (bagian <= 0) continue;
    await c.query('UPDATE pagu_hold SET nominal_terpakai = nominal_terpakai + $1 WHERE id = $2', [bagian / 100, h.id]);
    sisaBeban -= bagian;
  }
}

/**
 * Menutup pengajuan: melepas bagian kunci yang tidak jadi dipakai.
 *
 * Dipakai dua kali. Pertama saat pembayaran vendor selesai di bawah nominal
 * disetujui - selisihnya kembali ke pagu. Kedua saat LPJ disetujui dengan
 * pemakaian lebih kecil dari yang dibayar - sisanya kembali juga.
 *
 * Tanpa pelepasan ini, pagu bocor sedikit demi sedikit sepanjang tahun dan tidak
 * ada yang menyadarinya sampai akhir periode.
 */
export async function lepasSisaKunci(c, pengajuan_id) {
  await c.query(
    'UPDATE pagu_hold SET aktif = FALSE, dilepas_pada = now() WHERE pengajuan_id = $1 AND aktif',
    [pengajuan_id],
  );
}

/** Menyetel angka terpakai final setelah LPJ disetujui. */
export async function setelTerpakai(c, pengajuan_id, totalTerpakai) {
  const { rows: hold } = await c.query(
    'SELECT id, nominal, nominal_terpakai FROM pagu_hold WHERE pengajuan_id = $1 ORDER BY tingkat, id',
    [pengajuan_id],
  );
  const totalKini = hold.reduce((s, h) => s + Number(h.nominal_terpakai), 0);
  if (totalKini === 0) return;

  const sen = (v) => Math.round(Number(v) * 100);
  let sisa = sen(totalTerpakai);
  for (const [i, h] of hold.entries()) {
    const bagian = i === hold.length - 1
      ? Math.max(0, sisa)
      : Math.min(sen(h.nominal), Math.round((sen(totalTerpakai) * sen(h.nominal_terpakai)) / sen(totalKini)));
    await c.query('UPDATE pagu_hold SET nominal_terpakai = $1 WHERE id = $2', [bagian / 100, h.id]);
    sisa -= bagian;
  }
  await lepasSisaKunci(c, pengajuan_id);
}

export async function totalDibayar(c, pengajuan_id) {
  const db = c ?? { query: q };
  const { rows } = await db.query('SELECT COALESCE(sum(nominal), 0) AS n FROM pembayaran WHERE pengajuan_id = $1', [pengajuan_id]);
  return Number(rows[0].n);
}
