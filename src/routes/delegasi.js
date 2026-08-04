import { ruteAman } from '../lib/rute.js';
import { q, transaksi } from '../lib/db.js';
import { wajibLogin } from '../lib/auth.js';

export const rute = ruteAman();
rute.use(wajibLogin);

/**
 * Delegasi berjangka. Tidak ada eskalasi otomatis - ini satu-satunya mekanisme
 * saat approver berhalangan.
 *
 * Arahnya ke atas. Kalau ke bawah, kontrol berlapisnya hilang sama sekali:
 * Atasan 2 yang mendelegasikan ke Atasan 1 membuat satu orang menyetujui dua
 * tahap berturut-turut tanpa ada yang di atasnya memeriksa.
 */
const ARAH_KE_ATAS = { atasan_1: 'atasan_2', atasan_2: 'atasan_3' };

rute.get('/', async (req, res) => {
  const { rows } = await q(
    `SELECT d.*, pd.nama AS dari_nama, pd.peran AS dari_peran,
            pk.nama AS ke_nama, pk.peran AS ke_peran, pb.nama AS dibuat_oleh_nama,
            (d.dibatalkan_pada IS NULL AND CURRENT_DATE BETWEEN d.mulai AND d.selesai) AS sedang_aktif
       FROM delegasi d
       JOIN pengguna pd ON pd.id = d.dari_pengguna_id
       JOIN pengguna pk ON pk.id = d.ke_pengguna_id
       JOIN pengguna pb ON pb.id = d.dibuat_oleh
      WHERE $1::boolean IS TRUE OR d.dari_pengguna_id = $2 OR d.ke_pengguna_id = $2
      ORDER BY d.mulai DESC`,
    [req.pengguna.peran === 'super_admin', req.pengguna.id],
  );
  res.json(rows);
});

/** Approver menunjuk penggantinya sendiri sebelum berhalangan. */
rute.post('/', async (req, res) => {
  const tujuan = ARAH_KE_ATAS[req.pengguna.peran];
  if (!tujuan)
    return res.status(403).json({
      pesan: 'Peran Anda tidak punya tujuan delegasi alami. Mintakan penunjukan pengganti kepada Super Admin.',
    });
  res.json(await buat(req, res, { dari_id: req.pengguna.id, peran_tujuan: tujuan }));
});

/**
 * Penunjukan darurat oleh Super Admin, untuk kasus berhalangan mendadak -
 * delegasi berjangka mengandaikan orangnya sempat mengatur sebelumnya, dan itu
 * tidak selalu terjadi.
 *
 * Ini bukan hak menyetujui. Super Admin hanya memindahkan antrean; ia tidak
 * boleh jadi penerima delegasi karena tidak boleh terlibat alur pengajuan.
 */
rute.post('/darurat', async (req, res) => {
  if (req.pengguna.peran !== 'super_admin')
    return res.status(403).json({ pesan: 'Hanya Super Admin yang dapat menunjuk pengganti atas nama orang lain.' });
  if (!req.body?.dari_pengguna_id) return res.status(400).json({ pesan: 'Pengguna yang berhalangan wajib disebutkan.' });
  res.json(await buat(req, res, { dari_id: Number(req.body.dari_pengguna_id), peran_tujuan: null }));
});

async function buat(req, res, { dari_id, peran_tujuan }) {
  const b = req.body ?? {};
  if (!b.ke_pengguna_id || !b.mulai || !b.selesai || !b.alasan)
    return res.status(400).json({ pesan: 'Penerima, tanggal mulai, tanggal selesai, dan alasan wajib diisi.' }) && null;

  const hasil = await transaksi(async (c) => {
    const { rows: p } = await c.query('SELECT id, peran FROM pengguna WHERE id = ANY($1) AND aktif', [[dari_id, Number(b.ke_pengguna_id)]]);
    const dari = p.find((x) => Number(x.id) === Number(dari_id));
    const ke = p.find((x) => Number(x.id) === Number(b.ke_pengguna_id));
    if (!dari || !ke) return { kode: 400, pesan: 'Pengguna tidak ditemukan atau tidak aktif.' };
    if (ke.peran === 'super_admin')
      return { kode: 400, pesan: 'Super Admin tidak boleh menerima delegasi - ia tidak terlibat alur pengajuan.' };
    if (peran_tujuan && ke.peran !== peran_tujuan)
      return { kode: 400, pesan: `Delegasi dari ${dari.peran} hanya boleh ke ${peran_tujuan}. Arahnya harus ke atas.` };

    const { rows: bentrok } = await c.query(
      `SELECT 1 FROM delegasi WHERE dari_pengguna_id = $1 AND dibatalkan_pada IS NULL
          AND daterange(mulai, selesai, '[]') && daterange($2::date, $3::date, '[]') LIMIT 1`,
      [dari_id, b.mulai, b.selesai],
    );
    if (bentrok.length) return { kode: 409, pesan: 'Sudah ada delegasi aktif yang rentang tanggalnya bertumpang tindih.' };

    const { rows } = await c.query(
      `INSERT INTO delegasi (dari_pengguna_id, ke_pengguna_id, mulai, selesai, alasan, dibuat_oleh)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [dari_id, ke.id, b.mulai, b.selesai, b.alasan, req.pengguna.id],
    );
    await c.query(
      `INSERT INTO audit_master (tabel, record_id, aksi, oleh, sesudah)
       VALUES ('delegasi', $1, 'insert', $2, $3)`,
      [rows[0].id, req.pengguna.id, JSON.stringify(rows[0])],
    );
    return { ok: true, delegasi: rows[0] };
  });

  if (!hasil.ok) { res.status(hasil.kode).json({ pesan: hasil.pesan }); return null; }
  return { pesan: 'Delegasi tercatat. Antrean akan tampil di layar penerima selama rentang tanggalnya.', ...hasil };
}

/** Pembatalan lebih awal. Tidak berlaku surut - yang sudah ditindak tetap sah. */
rute.delete('/:id', async (req, res) => {
  const { rows } = await q('SELECT * FROM delegasi WHERE id = $1 AND dibatalkan_pada IS NULL', [req.params.id]);
  if (!rows.length) return res.status(404).json({ pesan: 'Delegasi tidak ditemukan atau sudah dibatalkan.' });
  const d = rows[0];
  if (req.pengguna.peran !== 'super_admin' && Number(d.dari_pengguna_id) !== Number(req.pengguna.id))
    return res.status(403).json({ pesan: 'Hanya pemberi delegasi atau Super Admin yang dapat membatalkan.' });

  await q('UPDATE delegasi SET dibatalkan_pada = now() WHERE id = $1', [req.params.id]);
  res.json({ pesan: 'Delegasi dibatalkan. Tindakan yang sudah dilakukan selama delegasi tetap sah.' });
});
