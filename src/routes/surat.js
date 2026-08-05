import { ruteAman } from '../lib/rute.js';
import { q } from '../lib/db.js';
import { wajibLogin } from '../lib/auth.js';
import { suratHtml } from '../lib/surat.js';

export const rute = ruteAman();
rute.use(wajibLogin);

// Urutan tahap pada surat. Jabatan diambil dari master pengguna, bukan ditulis
// tetap di sini - kalau nanti nama atau jabatan berubah, surat ikut menyesuaikan
// tanpa perlu mengubah kode.
const TAHAP = [
  { peran: 'Diajukan',  akun: 'admin',    dari: null,                 aksi: 'submit'  },
  { peran: 'Disetujui', akun: 'atasan_1', dari: 'menunggu_atasan_1',  aksi: 'approve' },
  { peran: 'Disetujui', akun: 'atasan_2', dari: 'menunggu_atasan_2',  aksi: 'approve' },
  { peran: 'Disetujui', akun: 'atasan_3', dari: 'menunggu_atasan_3',  aksi: 'approve' },
  { peran: 'Disetujui', akun: 'finance',  dari: 'menunggu_finance',   aksi: 'approve' },
];

rute.get('/:id/surat', async (req, res) => {
  const { rows } = await q(
    `SELECT p.*, k.nama AS kota, a.nama AS area, r.nama AS region, kb.nama AS kategori,
            pn.nama AS penerima, pn.jenis AS jenis_penerima, pn.bank, pn.no_rekening
       FROM pengajuan p
       JOIN kota k ON k.id = p.kota_id
       JOIN area a ON a.id = p.area_id
       JOIN region r ON r.id = p.region_id
       JOIN kategori_budget kb ON kb.id = p.kategori_id
       LEFT JOIN penerima pn ON pn.id = p.penerima_id
      WHERE p.id = $1`,
    [req.params.id],
  );
  if (!rows.length) return res.status(404).json({ pesan: 'Pengajuan tidak ditemukan.' });
  const p = rows[0];

  // Draft belum punya nomor dan belum dibekukan angkanya. Mencetaknya akan
  // menghasilkan dokumen berkop resmi yang isinya masih bisa berubah - itu
  // justru yang harus dicegah.
  if (p.status === 'draft')
    return res.status(409).json({ pesan: 'Draft belum dapat dicetak. Kirim pengajuannya lebih dulu.' });

  const [{ rows: item }, { rows: log }, { rows: pengguna }] = await Promise.all([
    q('SELECT * FROM pengajuan_item WHERE pengajuan_id = $1 ORDER BY urutan, id', [p.id]),
    q(`SELECT l.status_dari, l.aksi, l.waktu, l.versi_no,
              u.nama AS oleh_nama, u.peran AS oleh_peran, un.nama AS atas_nama_nama
         FROM pengajuan_log l
         LEFT JOIN pengguna u  ON u.id  = l.oleh
         LEFT JOIN pengguna un ON un.id = l.atas_nama
        WHERE l.pengajuan_id = $1 AND l.versi_no = $2
        ORDER BY l.waktu`, [p.id, p.versi_no]),
    q('SELECT peran, nama, jabatan FROM pengguna WHERE aktif', []),
  ]);

  const petaPengguna = Object.fromEntries(pengguna.map((u) => [u.peran, u]));

  const ttd = TAHAP.map((t) => {
    const akun = petaPengguna[t.akun] ?? {};
    const jejak = log.find((l) => l.aksi === t.aksi && (t.dari === null || l.status_dari === t.dari));

    // Jalur cepat melewati Atasan 3. Ditandai "dilewati", bukan "menunggu" -
    // kalau tidak, surat yang sudah tuntas akan terlihat seperti masih
    // menggantung di satu tahap.
    const dilewati = t.akun === 'atasan_3' && p.jalur_cepat && !jejak;

    return {
      peran: t.peran,
      jabatan: akun.jabatan || t.akun.replace(/_/g, ' '),
      nama: jejak?.oleh_nama || akun.nama,
      waktu: jejak?.waktu ?? null,
      atasNama: jejak?.atas_nama_nama ?? null,
      status: jejak ? 'setuju' : dilewati ? 'lewat' : 'tunggu',
    };
  });

  const html = suratHtml({ p, item, ttd, dicetakOleh: req.pengguna.nama });
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('content-disposition', `inline; filename="${p.nomor.replace(/\//g, '-')}.html"`);
  res.send(html);
});
