import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { pool } from './db.js';

/**
 * Membuat ulang sandi seluruh akun aktif, atau hanya akun tertentu.
 *
 *   npm run sandi:reset                       semua akun
 *   npm run sandi:reset -- admin@cbs.co.id    satu akun saja
 *
 * Dipakai saat sandi awal terlanjur tercatat di tempat yang tidak semestinya,
 * dan saat seseorang meninggalkan perannya. Sandi lama tidak dapat dipulihkan.
 */
const email = process.argv[2] ?? null;

const { rows } = await pool.query(
  email
    ? 'SELECT id, email FROM pengguna WHERE email = $1 AND aktif'
    : 'SELECT id, email FROM pengguna WHERE aktif ORDER BY id',
  email ? [email.toLowerCase().trim()] : [],
);

if (!rows.length) {
  console.error(email ? `Akun ${email} tidak ditemukan atau tidak aktif.` : 'Tidak ada akun aktif.');
  await pool.end();
  process.exit(1);
}

console.log('\nSandi baru - dicetak sekali, tidak dapat dilihat lagi:');
for (const p of rows) {
  const sandi = randomBytes(9).toString('base64url');
  await pool.query('UPDATE pengguna SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(sandi, 12), p.id]);
  console.log(`  ${p.email.padEnd(32)} ${sandi}`);
}
console.log('\nBagikan lewat kanal aman, jangan lewat chat atau email biasa.\n');

await pool.end();
