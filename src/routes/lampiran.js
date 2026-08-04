import multer from 'multer';
import { ruteAman } from '../lib/rute.js';
import { q } from '../lib/db.js';
import { wajibLogin } from '../lib/auth.js';
import { simpanBerkas, aliranBerkas, hapusBerkas, periksaBerkas, BATAS_BYTE } from '../lib/berkas.js';

export const rute = ruteAman();
rute.use(wajibLogin);

const unggahan = multer({ storage: multer.memoryStorage(), limits: { fileSize: BATAS_BYTE } });
const PEMILIK = new Set(['pengajuan', 'pembayaran', 'lpj']);

rute.get('/', async (req, res) => {
  const { pemilik_jenis, pemilik_id } = req.query;
  if (!PEMILIK.has(pemilik_jenis) || !pemilik_id)
    return res.status(400).json({ pesan: 'pemilik_jenis dan pemilik_id wajib diisi.' });
  const { rows } = await q(
    `SELECT l.id, l.jenis, l.nama_berkas, l.ukuran_byte, l.diunggah_pada, u.nama AS diunggah_oleh_nama
       FROM lampiran l JOIN pengguna u ON u.id = l.diunggah_oleh
      WHERE l.pemilik_jenis = $1 AND l.pemilik_id = $2 ORDER BY l.id`,
    [pemilik_jenis, pemilik_id],
  );
  res.json(rows);
});

rute.post('/', unggahan.single('berkas'), async (req, res) => {
  const { pemilik_jenis, pemilik_id, jenis } = req.body ?? {};
  if (!PEMILIK.has(pemilik_jenis) || !pemilik_id)
    return res.status(400).json({ pesan: 'pemilik_jenis dan pemilik_id wajib diisi.' });
  if (!req.file) return res.status(400).json({ pesan: 'Berkas belum dipilih.' });

  const galat = periksaBerkas(req.file.originalname, req.file.size);
  if (galat) return res.status(422).json({ pesan: galat });

  // Lampiran hanya boleh ditambahkan selama pengajuan belum final - setelah
  // selesai atau ditolak, isinya tidak boleh berubah lagi demi jejak audit.
  if (pemilik_jenis === 'pengajuan') {
    const { rows } = await q('SELECT status FROM pengajuan WHERE id = $1', [pemilik_id]);
    if (!rows.length) return res.status(404).json({ pesan: 'Pengajuan tidak ditemukan.' });
    if (['ditolak', 'dibatalkan'].includes(rows[0].status))
      return res.status(409).json({ pesan: 'Pengajuan sudah final, lampiran tidak dapat ditambahkan.' });
  }

  const lokasi = await simpanBerkas(req.file.buffer, req.file.originalname);
  const { rows } = await q(
    `INSERT INTO lampiran (pemilik_jenis, pemilik_id, jenis, nama_berkas, lokasi, ukuran_byte, mime, diunggah_oleh)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, jenis, nama_berkas, ukuran_byte, diunggah_pada`,
    [pemilik_jenis, pemilik_id, jenis || 'pendukung', req.file.originalname, lokasi,
     req.file.size, req.file.mimetype, req.pengguna.id],
  );
  res.status(201).json(rows[0]);
});

rute.get('/:id/unduh', async (req, res) => {
  const { rows } = await q('SELECT nama_berkas, lokasi, mime FROM lampiran WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ pesan: 'Lampiran tidak ditemukan.' });
  res.setHeader('content-type', rows[0].mime || 'application/octet-stream');
  res.setHeader('content-disposition', `inline; filename="${encodeURIComponent(rows[0].nama_berkas)}"`);
  aliranBerkas(rows[0].lokasi)
    .on('error', () => res.status(410).json({ pesan: 'Berkas tidak ditemukan di penyimpanan.' }))
    .pipe(res);
});

rute.delete('/:id', async (req, res) => {
  const { rows } = await q('SELECT * FROM lampiran WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ pesan: 'Lampiran tidak ditemukan.' });
  if (Number(rows[0].diunggah_oleh) !== Number(req.pengguna.id))
    return res.status(403).json({ pesan: 'Hanya pengunggah yang dapat menghapus lampirannya.' });
  await q('DELETE FROM lampiran WHERE id = $1', [req.params.id]);
  await hapusBerkas(rows[0].lokasi);
  res.json({ pesan: 'Lampiran dihapus.' });
});
