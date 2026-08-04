import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import 'dotenv/config';
import { pool } from './lib/db.js';
import { rute as auth } from './routes/auth.js';
import { rute as master } from './routes/master.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Akar domain menjawab dengan identitas layanan, bukan 404. Membuka domain dan
// menemukan "tidak ditemukan" membuat deployment yang sehat terlihat gagal.
app.get('/', (_req, res) =>
  res.json({
    layanan: 'Budget Tracker CBS',
    versi: process.env.npm_package_version ?? '0.1.0',
    keterangan: 'API pengajuan dan approval budget. Antarmuka pengguna belum tersedia pada fase ini.',
    periksa: '/sehat',
  }));

app.get('/sehat', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'sehat', waktu: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'basis data tidak terjangkau' });
  }
});

app.use('/api/auth', auth);
app.use('/api/master', master);

app.use((_req, res) => res.status(404).json({ pesan: 'Alamat tidak ditemukan.' }));

// Galat tak terduga tidak pernah membocorkan detail teknis ke pengguna.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ pesan: 'Terjadi kesalahan di server. Coba lagi beberapa saat.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Budget Tracker CBS berjalan di :${port}`));
