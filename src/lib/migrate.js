import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db');

// Migrasi harus bisa dijalankan ulang dari nol tanpa penyesuaian manual.
await pool.query(`
  CREATE TABLE IF NOT EXISTS migrasi (
    berkas       TEXT PRIMARY KEY,
    dijalankan   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

const sudah = new Set((await pool.query('SELECT berkas FROM migrasi')).rows.map((r) => r.berkas));
const berkas = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

for (const f of berkas) {
  if (sudah.has(f)) { console.log(`lewati  ${f}`); continue; }
  const sql = await readFile(join(dir, f), 'utf8');
  const c = await pool.connect();
  try {
    await c.query(sql);
    await c.query('INSERT INTO migrasi (berkas) VALUES ($1)', [f]);
    console.log(`jalan   ${f}`);
  } catch (e) {
    console.error(`GAGAL   ${f}\n${e.message}`);
    process.exitCode = 1;
    break;
  } finally { c.release(); }
}
await pool.end();
