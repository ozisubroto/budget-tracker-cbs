import { q } from './db.js';

/**
 * Pengirim WhatsApp, dibungkus di satu berkas.
 *
 * Penggantian vendor atau perpindahan ke Cloud API resmi hanya mengubah fungsi
 * `kirimKeGateway` di bawah. Sisa aplikasi tidak tahu vendor mana yang dipakai -
 * itu memang tujuannya, karena gateway pihak ketiga adalah bagian yang paling
 * mungkin diganti.
 *
 * Notifikasi dalam aplikasi tetap sumber kebenaran. WhatsApp hanya pengantar:
 * tidak boleh ada informasi yang hanya tersedia di sana.
 */

export const waAktif = () => Boolean(process.env.WA_GATEWAY_URL && process.env.WA_GATEWAY_TOKEN);

/**
 * Menormalkan nomor WhatsApp ke bentuk yang diterima gateway: angka polos
 * diawali kode negara, tanpa "+", "0" di depan, spasi, atau tanda pisah.
 *
 * Dipanggil sekali saat nomor disimpan (PATCH /master/pengguna), bukan setiap
 * kali dikirim - supaya seluruh kode di hilir cukup mengasumsikan satu bentuk.
 * Mengembalikan null untuk input kosong, dan melempar pesan yang jelas kalau
 * polanya tidak masuk akal - lebih baik ditolak saat disimpan daripada gagal
 * kirim diam-diam berbulan-bulan kemudian.
 */
export function normalisasiNoWa(nomor) {
  if (nomor === null || nomor === undefined || String(nomor).trim() === '') return null;
  let bersih = String(nomor).replace(/[\s\-().]/g, '');
  if (bersih.startsWith('+')) bersih = bersih.slice(1);
  if (bersih.startsWith('0')) bersih = '62' + bersih.slice(1);
  if (!bersih.startsWith('62')) bersih = '62' + bersih;
  if (!/^62\d{8,14}$/.test(bersih))
    throw new Error(`Nomor WhatsApp "${nomor}" tidak sah. Contoh yang benar: 081234567890 atau 6281234567890.`);
  return bersih;
}

async function kirimKeGateway(nomor, teks) {
  const r = await fetch(process.env.WA_GATEWAY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.WA_GATEWAY_TOKEN}` },
    body: JSON.stringify({ to: nomor, message: teks }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`Gateway membalas ${r.status}`);
  return (await r.text()).slice(0, 500);
}

/**
 * Menyusun isi pesan.
 *
 * Sengaja pendek dan tanpa tombol. Tombol approve di WhatsApp terlihat praktis,
 * tapi artinya orang menyetujui anggaran tanpa melihat cost ratio, sisa pagu,
 * dan lampirannya. Rekening penerima dan lampiran tidak pernah ikut dikirim -
 * pesan melewati server pihak ketiga.
 */
export function susunPesan({ judul, isi, pengajuan_id }) {
  const tautan = process.env.APP_URL ? `\n${process.env.APP_URL}/pengajuan/${pengajuan_id ?? ''}` : '';
  return [judul, isi, tautan].filter(Boolean).join('\n');
}

/** Memasukkan ke antrean. Tidak pernah mengirim langsung di jalur permintaan. */
export async function antrekan(c, notifikasi_id, pengguna_id) {
  if (!waAktif()) return;
  const { rows } = await c.query('SELECT no_wa FROM pengguna WHERE id = $1 AND aktif', [pengguna_id]);
  const nomor = rows[0]?.no_wa;
  if (!nomor) return;
  await c.query(
    "INSERT INTO notifikasi_kirim (notifikasi_id, kanal, tujuan, status) VALUES ($1,'whatsapp',$2,'antre')",
    [notifikasi_id, nomor],
  );
}

/**
 * Pekerja antrean.
 *
 * Berjalan di latar belakang, bukan di jalur permintaan. Orang yang menekan
 * tombol approve tidak boleh ikut menunggu WhatsApp - kalau gateway lambat atau
 * mati, alur di aplikasi harus tetap jalan.
 *
 * Status kirim dicatat di basis data sendiri, tidak bergantung dasbor vendor.
 * Dasbor itu akan hilang saat penyedia diganti.
 */
export async function prosesAntrean(batas = 20) {
  if (!waAktif()) return { dilewati: true };
  const { rows } = await q(
    `SELECT nk.id, nk.tujuan, nk.percobaan, n.judul, n.isi, n.pengajuan_id
       FROM notifikasi_kirim nk JOIN notifikasi n ON n.id = nk.notifikasi_id
      WHERE nk.kanal = 'whatsapp' AND nk.status IN ('antre','gagal') AND nk.percobaan < 5
        AND (nk.terakhir_dicoba IS NULL OR nk.terakhir_dicoba < now() - interval '5 minutes')
      ORDER BY nk.id LIMIT $1`,
    [batas],
  );

  let terkirim = 0, gagal = 0;
  for (const r of rows) {
    try {
      const respons = await kirimKeGateway(r.tujuan, susunPesan(r));
      await q(
        `UPDATE notifikasi_kirim SET status = 'terkirim', percobaan = percobaan + 1,
                terakhir_dicoba = now(), respons = $1 WHERE id = $2`,
        [respons, r.id],
      );
      terkirim++;
    } catch (e) {
      await q(
        `UPDATE notifikasi_kirim SET status = 'gagal', percobaan = percobaan + 1,
                terakhir_dicoba = now(), respons = $1 WHERE id = $2`,
        [e.message.slice(0, 500), r.id],
      );
      gagal++;
    }
  }
  return { terkirim, gagal, diproses: rows.length };
}

export function jalankanPekerjaWa() {
  if (!waAktif()) return;
  const jalan = async () => {
    try {
      const h = await prosesAntrean();
      if (h.diproses) console.log('Antrean WhatsApp:', JSON.stringify(h));
    } catch (e) { console.error('Pekerja WhatsApp:', e.message); }
  };
  setTimeout(jalan, 15_000).unref?.();
  setInterval(jalan, 60_000).unref?.();
}
