import { ruteAman } from '../lib/rute.js';
import bcrypt from 'bcryptjs';
import { q } from '../lib/db.js';
import { buatToken, wajibLogin } from '../lib/auth.js';

export const rute = ruteAman();

rute.post('/masuk', async (req, res) => {
  const { email, sandi } = req.body ?? {};
  if (!email || !sandi) return res.status(400).json({ pesan: 'Email dan kata sandi wajib diisi.' });

  const { rows } = await q('SELECT * FROM pengguna WHERE email = $1 AND aktif', [String(email).toLowerCase().trim()]);
  const p = rows[0];
  // Pesan sengaja tidak membedakan email salah dan sandi salah.
  if (!p || !(await bcrypt.compare(sandi, p.password_hash)))
    return res.status(401).json({ pesan: 'Email atau kata sandi tidak cocok.' });

  res.json({ token: buatToken(p), pengguna: { id: p.id, nama: p.nama, peran: p.peran, jabatan: p.jabatan } });
});

rute.get('/saya', wajibLogin, async (req, res) => {
  const { rows } = await q(
    `SELECT p.id, p.nama, p.email, p.peran, p.jabatan, p.no_wa,
            COALESCE(json_agg(json_build_object('peran', d2.peran, 'nama', d2.nama, 'selesai', d.selesai))
                     FILTER (WHERE d.id IS NOT NULL), '[]') AS delegasi_diterima
       FROM pengguna p
       LEFT JOIN delegasi d  ON d.ke_pengguna_id = p.id
                             AND d.dibatalkan_pada IS NULL
                             AND CURRENT_DATE BETWEEN d.mulai AND d.selesai
       LEFT JOIN pengguna d2 ON d2.id = d.dari_pengguna_id
      WHERE p.id = $1
      GROUP BY p.id`,
    [req.pengguna.id],
  );
  res.json(rows[0]);
});
