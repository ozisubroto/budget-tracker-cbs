import pg from 'pg';
import 'dotenv/config';

// NUMERIC dikembalikan pg sebagai string agar presisi desimal tidak hilang.
// Jangan diubah menjadi Number: ini data uang.
pg.types.setTypeParser(1700, (v) => v);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
});

export const q = (text, params) => pool.query(text, params);

/**
 * Menjalankan sekumpulan perintah dalam satu transaksi.
 * Dipakai untuk operasi yang harus utuh atau gagal seluruhnya - misalnya
 * menyimpan pembayaran sekaligus memindahkan angka dari terkunci ke terpakai.
 */
export async function transaksi(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const hasil = await fn(c);
    await c.query('COMMIT');
    return hasil;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
