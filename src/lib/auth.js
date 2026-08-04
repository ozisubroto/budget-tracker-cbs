import jwt from 'jsonwebtoken';
import { q } from './db.js';

const RAHASIA = process.env.JWT_SECRET;
if (!RAHASIA) throw new Error('JWT_SECRET belum diisi');

export const buatToken = (p) =>
  jwt.sign({ id: p.id, peran: p.peran, nama: p.nama }, RAHASIA, { expiresIn: process.env.JWT_TTL || '12h' });

/** Menolak permintaan tanpa token yang sah. */
export function wajibLogin(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ pesan: 'Silakan masuk terlebih dahulu.' });
  try {
    req.pengguna = jwt.verify(token, RAHASIA);
    next();
  } catch {
    res.status(401).json({ pesan: 'Sesi sudah berakhir. Silakan masuk kembali.' });
  }
}

/**
 * Membatasi akses ke peran tertentu.
 *
 * Delegasi berjangka menambah peran efektif: selama rentang tanggalnya aktif,
 * penerima delegasi boleh bertindak pada antrean pemberi delegasi. Setiap
 * tindakan seperti itu dicatat dengan dua nama - pelaksana dan atas nama siapa.
 */
export function wajibPeran(...peran) {
  return async (req, res, next) => {
    if (peran.includes(req.pengguna.peran)) { req.atasNama = null; return next(); }

    const { rows } = await q(
      `SELECT p.id, p.peran
         FROM delegasi d
         JOIN pengguna p ON p.id = d.dari_pengguna_id
        WHERE d.ke_pengguna_id = $1
          AND d.dibatalkan_pada IS NULL
          AND CURRENT_DATE BETWEEN d.mulai AND d.selesai
          AND p.peran = ANY($2::peran[])
        LIMIT 1`,
      [req.pengguna.id, peran],
    );
    if (!rows.length) return res.status(403).json({ pesan: 'Peran Anda tidak punya akses ke tindakan ini.' });

    req.atasNama = rows[0].id;
    req.peranEfektif = rows[0].peran;
    next();
  };
}

/**
 * Super Admin mengubah aturan mainnya, jadi tidak boleh sekaligus ikut bermain.
 * Dipasang pada seluruh rute pengajuan, persetujuan, pembayaran, dan LPJ.
 */
export function tolakSuperAdmin(req, res, next) {
  if (req.pengguna.peran === 'super_admin')
    return res.status(403).json({ pesan: 'Super Admin tidak dapat terlibat dalam alur pengajuan.' });
  next();
}
