import { Router } from 'express';

/**
 * Router yang meneruskan galat dari handler async ke penangan galat Express.
 *
 * Express 4 tidak menangkap promise yang ditolak di dalam handler. Tanpa
 * pembungkus ini, satu galat basis data akan mematikan seluruh proses - bukan
 * mengembalikan pesan ke pengguna. Pada aplikasi yang memegang data uang, mati
 * karena satu kueri gagal adalah kegagalan yang jauh lebih mahal daripada
 * permintaan yang ditolak.
 */
export function ruteAman() {
  const r = Router();
  for (const metode of ['get', 'post', 'put', 'patch', 'delete']) {
    const asli = r[metode].bind(r);
    r[metode] = (jalur, ...handler) =>
      asli(
        jalur,
        ...handler.map((f) =>
          // Handler bertanda tangan empat argumen adalah penangan galat; biarkan.
          f.length === 4 ? f : (req, res, next) => Promise.resolve(f(req, res, next)).catch(next),
        ),
      );
  }
  return r;
}
