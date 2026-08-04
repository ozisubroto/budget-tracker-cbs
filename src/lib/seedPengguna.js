import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { pool, transaksi } from './db.js';

// Enam peran, satu orang per peran. Basis data menjaga aturan itu lewat indeks
// unik parsial, jadi menjalankan ulang skrip ini tidak akan menggandakan akun.
const AKUN = [
  ['admin',       'Admin Anggaran',   'admin@cbsgroup.co.id'],
  ['atasan_1',    'Atasan 1',         'atasan1@cbsgroup.co.id'],
  ['atasan_2',    'Atasan 2',         'atasan2@cbsgroup.co.id'],
  ['atasan_3',    'Atasan 3',         'atasan3@cbsgroup.co.id'],
  ['finance',     'Finance',          'finance@cbsgroup.co.id'],
  ['super_admin', 'Super Admin',      'superadmin@cbsgroup.co.id'],
];

// Nilai awal pengaturan, sesuai kesepakatan desain.
// batas_pagu_atasan_2 dan ambang_cost_ratio hanya berubah setelah disetujui
// Atasan 3; sisanya langsung berlaku setelah diubah Super Admin.
const PENGATURAN = [
  ['batas_pagu_atasan_2',     200000000, 'Di bawah nilai ini pengajuan lompat langsung ke Finance.'],
  ['ambang_cost_ratio',            0.12, 'Sedikit di atas rasio rencana 10%. Tinjau ulang bila rasio tahunan berubah.'],
  ['batas_waktu_lpj_hari',           14, 'Dihitung dari tanggal selesai program.'],
  ['ambang_penutupan_persen',      0.10, 'Selisih pembayaran di atas ini wajib beralasan.'],
  ['ambang_penutupan_rupiah',    500000, 'Dipakai bila lebih kecil dari ambang persen.'],
];

const sandiAcak = () => randomBytes(9).toString('base64url');

await transaksi(async (c) => {
  const kredensial = [];
  for (const [peran, nama, email] of AKUN) {
    const ada = await c.query('SELECT id FROM pengguna WHERE peran = $1 AND aktif', [peran]);
    if (ada.rows.length) { console.log(`lewati  ${peran} sudah ada`); continue; }
    const sandi = sandiAcak();
    await c.query(
      'INSERT INTO pengguna (nama, email, password_hash, peran) VALUES ($1, $2, $3, $4)',
      [nama, email, await bcrypt.hash(sandi, 12), peran],
    );
    kredensial.push([email, sandi]);
  }

  const sa = (await c.query("SELECT id FROM pengguna WHERE peran = 'super_admin' AND aktif")).rows[0];
  const a3 = (await c.query("SELECT id FROM pengguna WHERE peran = 'atasan_3'    AND aktif")).rows[0];

  for (const [kode, nilai, catatan] of PENGATURAN) {
    const ada = await c.query("SELECT 1 FROM pengaturan WHERE kode = $1 AND status = 'berlaku'", [kode]);
    if (ada.rows.length) continue;
    await c.query(
      `INSERT INTO pengaturan (kode, nilai, berlaku_sejak, status, diusulkan_oleh, disetujui_oleh, disetujui_pada, catatan)
       VALUES ($1, $2, now(), 'berlaku', $3, $4, now(), $5)`,
      [kode, nilai, sa.id, a3.id, catatan],
    );
    console.log(`pengaturan ${kode} = ${nilai}`);
  }

  if (kredensial.length) {
    console.log('\nKata sandi awal - dicetak sekali, tidak dapat dilihat lagi:');
    for (const [email, sandi] of kredensial) console.log(`  ${email.padEnd(32)} ${sandi}`);
    console.log('\nMinta setiap pemilik akun menggantinya setelah masuk pertama kali.');
  }
});

await pool.end();
