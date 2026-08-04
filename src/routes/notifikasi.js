import { ruteAman } from '../lib/rute.js';
import { q } from '../lib/db.js';
import { wajibLogin, wajibPeran } from '../lib/auth.js';
import { prosesAntrean, waAktif } from '../lib/wa.js';

export const rute = ruteAman();
rute.use(wajibLogin);

rute.get('/', async (req, res) => {
  const { rows } = await q(
    `SELECT n.*, p.nomor FROM notifikasi n
       LEFT JOIN pengajuan p ON p.id = n.pengajuan_id
      WHERE n.pengguna_id = $1 AND ($2::boolean IS NOT TRUE OR n.dibaca_pada IS NULL)
      ORDER BY n.dibuat_pada DESC LIMIT 100`,
    [req.pengguna.id, req.query.belum === '1'],
  );
  const { rows: hitung } = await q(
    'SELECT count(*) AS belum FROM notifikasi WHERE pengguna_id = $1 AND dibaca_pada IS NULL',
    [req.pengguna.id],
  );
  res.json({ belum_dibaca: Number(hitung[0].belum), notifikasi: rows });
});

rute.post('/baca', async (req, res) => {
  await q(
    `UPDATE notifikasi SET dibaca_pada = now()
      WHERE pengguna_id = $1 AND dibaca_pada IS NULL
        AND ($2::bigint IS NULL OR id = $2)`,
    [req.pengguna.id, req.body?.id ?? null],
  );
  res.json({ pesan: 'Ditandai sudah dibaca.' });
});

// Pemantauan antrean WhatsApp. Status kirim dicatat sendiri, tidak bergantung
// dasbor vendor - dasbor itu hilang saat penyedia diganti.
rute.get('/antrean', wajibPeran('super_admin'), async (_req, res) => {
  const { rows } = await q(
    `SELECT nk.status, count(*) AS jumlah FROM notifikasi_kirim nk
      WHERE nk.kanal = 'whatsapp' GROUP BY nk.status`,
  );
  const { rows: gagal } = await q(
    `SELECT nk.id, nk.tujuan, nk.percobaan, nk.terakhir_dicoba, nk.respons, n.judul
       FROM notifikasi_kirim nk JOIN notifikasi n ON n.id = nk.notifikasi_id
      WHERE nk.kanal = 'whatsapp' AND nk.status = 'gagal'
      ORDER BY nk.terakhir_dicoba DESC LIMIT 20`,
  );
  res.json({ gateway_aktif: waAktif(), ringkas: rows, gagal_terakhir: gagal });
});

rute.post('/antrean/proses', wajibPeran('super_admin'), async (_req, res) => {
  res.json(await prosesAntrean(50));
});
