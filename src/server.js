import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import cors from 'cors';
import 'dotenv/config';
import { pool } from './lib/db.js';
import { rute as auth } from './routes/auth.js';
import { rute as master } from './routes/master.js';
import { rute as plan } from './routes/plan.js';
import { rute as pagu } from './routes/pagu.js';
import { rute as sinkron } from './routes/sinkron.js';
import { rute as pengajuan } from './routes/pengajuan.js';
import { rute as realisasi } from './routes/realisasi.js';
import { rute as lpj } from './routes/lpj.js';
import { rute as laporan } from './routes/laporan.js';
import { rute as delegasi } from './routes/delegasi.js';
import { rute as notifikasi } from './routes/notifikasi.js';
import { rute as lampiran } from './routes/lampiran.js';
import { rute as surat } from './routes/surat.js';
import { jadwalkanSinkron } from './lib/sinkronSales.js';
import { jalankanPekerjaWa } from './lib/wa.js';
import { jadwalkanPengingat } from './lib/pengingat.js';

const app = express();
// Helmet default melarang frame-src dan object-src selain 'self', sehingga
// <iframe src="blob:..."> untuk pratinjau PDF ditolak peramban dengan pesan
// "This content is blocked". blob: perlu diizinkan eksplisit di kedua arah.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'frame-src': ["'self'", 'blob:'],
      'object-src': ["'self'", 'blob:'],
      'img-src': ["'self'", 'data:', 'blob:'],
    },
  },
}));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Akar domain menjawab dengan identitas layanan, bukan 404. Membuka domain dan
// menemukan "tidak ditemukan" membuat deployment yang sehat terlihat gagal.
app.get('/api', (_req, res) =>
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
app.use('/api/plan', plan);
app.use('/api/pagu', pagu);
app.use('/api/sinkron', sinkron);
app.use('/api/pengajuan', pengajuan);
app.use('/api/pengajuan', realisasi);
app.use('/api/lpj', lpj);
app.use('/api/laporan', laporan);
app.use('/api/delegasi', delegasi);
app.use('/api/notifikasi', notifikasi);
app.use('/api/lampiran', lampiran);
app.use('/api/pengajuan', surat);

// Antarmuka React disajikan dari proses yang sama dengan API. Satu service, satu
// domain - tidak ada CORS yang perlu diatur dan tidak ada tagihan kedua.
const web = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');
if (existsSync(web)) {
  app.use(express.static(web));
  app.get(/^(?!\/api|\/sehat).*/, (_req, res) => res.sendFile(join(web, 'index.html')));
}

app.use((_req, res) => res.status(404).json({ pesan: 'Alamat tidak ditemukan.' }));

// Galat tak terduga tidak pernah membocorkan detail teknis ke pengguna.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ pesan: 'Terjadi kesalahan di server. Coba lagi beberapa saat.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Budget Tracker CBS berjalan di :${port}`);
  jadwalkanSinkron();
  jalankanPekerjaWa();
  jadwalkanPengingat();
});
