import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, extname } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Penyimpanan berkas lampiran.
 *
 * Terpisah dari basis data. Lampiran tumbuh jauh lebih cepat daripada datanya,
 * dan menaruhnya di tempat yang sama membuat basis data ikut mati saat
 * penyimpanan penuh.
 *
 * Implementasi sekarang menulis ke direktori. Di Railway, direktori itu WAJIB
 * berupa Volume yang di-mount ke /data - tanpa itu, seluruh lampiran hilang
 * setiap kali aplikasi di-deploy ulang.
 *
 * Perpindahan ke penyimpanan objek nanti hanya mengubah tiga fungsi di berkas
 * ini; pemanggilnya tidak perlu tahu.
 */

const DIR = process.env.LAMPIRAN_DIR || '/data/lampiran';

const IZIN = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.xlsx', '.xls', '.docx']);
export const BATAS_BYTE = 10 * 1024 * 1024;

export function periksaBerkas(nama, ukuran) {
  const ext = extname(nama || '').toLowerCase();
  if (!IZIN.has(ext)) return `Format ${ext || 'ini'} tidak diizinkan. Gunakan PDF, gambar, Excel, atau Word.`;
  if (ukuran > BATAS_BYTE) return `Ukuran ${(ukuran / 1048576).toFixed(1)} MB melebihi batas 10 MB.`;
  return null;
}

export async function simpanBerkas(buffer, namaAsli) {
  await mkdir(DIR, { recursive: true });
  // Nama di penyimpanan diacak, bukan memakai nama asli. Nama asli bisa memuat
  // karakter jalur atau bertabrakan dengan berkas lain.
  const nama = `${Date.now()}-${randomBytes(6).toString('hex')}${extname(namaAsli).toLowerCase()}`;
  await writeFile(join(DIR, nama), buffer);
  return nama;
}

export const aliranBerkas = (lokasi) => createReadStream(join(DIR, lokasi));
export const hapusBerkas = (lokasi) => unlink(join(DIR, lokasi)).catch(() => {});
