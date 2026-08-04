import { q } from './db.js';
import { PEMEGANG } from './status.js';

/**
 * Notifikasi hanya untuk hal yang menuntut tindakan, atau yang menyangkut
 * pengajuan yang dibuat atau disetujui orang itu.
 *
 * Kalau semua orang menerima notifikasi untuk semua kejadian, dalam dua minggu
 * semua orang akan mengabaikannya - dan aplikasi kehilangan satu-satunya cara
 * memberi tahu ada pengajuan menggantung.
 */
export async function beriTahu(c, { peran, pengguna_id, pengajuan_id, jenis, judul, isi }) {
  let target = pengguna_id;
  if (!target && peran) {
    const { rows } = await c.query('SELECT id FROM pengguna WHERE peran = $1 AND aktif', [peran]);
    if (!rows.length) return;
    target = rows[0].id;
  }
  if (!target) return;
  await c.query(
    'INSERT INTO notifikasi (pengguna_id, pengajuan_id, jenis, judul, isi) VALUES ($1,$2,$3,$4,$5)',
    [target, pengajuan_id, jenis, judul, isi ?? null],
  );
}

export const pemegangStatus = (status) => PEMEGANG[status] ?? null;
