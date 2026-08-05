import { pool, q } from './db.js';
import { beriTahu } from './notifikasi.js';
import { PEMEGANG } from './status.js';

/**
 * Pengingat pengajuan menggantung.
 *
 * Tidak ada eskalasi otomatis dalam arti memindahkan hak menyetujui - itu
 * keputusan yang sudah dikunci sejak Fase 5. Yang ada di sini murni pengingat:
 * memberi tahu, tanpa mengubah siapa yang berwenang menindak.
 *
 * Rantai eskalasi pengingat: Atasan 1 -> Atasan 2, Atasan 2 -> Atasan 3.
 * Atasan 3 dan Finance ada di puncak rantai masing-masing, jadi pengingat
 * untuk keduanya dikirim ulang ke orang yang sama - bukan ke Super Admin,
 * yang memang tidak boleh terlibat sama sekali di alur pengajuan.
 */
const ESKALASI = { atasan_1: 'atasan_2', atasan_2: 'atasan_3' };

async function ambilBatasHari() {
  const { rows } = await q(
    `SELECT nilai FROM pengaturan WHERE kode = 'batas_menggantung_hari' AND status = 'berlaku'
      ORDER BY berlaku_sejak DESC LIMIT 1`,
  );
  return Number(rows[0]?.nilai ?? 2);
}

export async function prosesPengingatMenggantung() {
  const batasHari = await ambilBatasHari();

  // Umur dihitung dari jejak terakhir di log, bukan dari waktu dibuat -
  // pengajuan yang baru saja pindah tahap belum "menggantung" meski nomornya
  // sudah lama. pengingat_terakhir mencegah pengingat terkirim berkali-kali
  // dalam satu hari meski penjadwal berjalan tiap jam, dan tetap benar setelah
  // kontainer di-restart karena disimpan di basis data, bukan di memori.
  const { rows } = await q(
    `SELECT p.id, p.nomor, p.status, p.judul, p.total_nominal, p.pengingat_jumlah,
            k.nama AS kota, r.nama AS region,
            COALESCE((SELECT max(waktu) FROM pengajuan_log l WHERE l.pengajuan_id = p.id), p.dibuat_pada) AS sejak
       FROM pengajuan p
       JOIN kota k ON k.id = p.kota_id
       JOIN region r ON r.id = p.region_id
      WHERE p.status IN ('menunggu_atasan_1','menunggu_atasan_2','menunggu_atasan_3','menunggu_finance')
        AND (p.pengingat_terakhir IS NULL OR p.pengingat_terakhir < now() - interval '20 hours')`,
  );

  let dikirim = 0;
  const rp = (n) => 'Rp ' + Math.round(Number(n)).toLocaleString('id-ID');

  for (const p of rows) {
    const umurHari = (Date.now() - new Date(p.sejak).getTime()) / 86_400_000;
    if (umurHari < batasHari) continue;

    const pemegangAsli = PEMEGANG[p.status];
    // Pengingat pertama selalu ke approver yang sebenarnya memegang tahap itu -
    // "approver, lalu atasannya" berarti approver dulu, eskalasi menyusul.
    // Baru pada pengingat kedua dan seterusnya dialihkan ke atasannya.
    const sudahPernah = Number(p.pengingat_jumlah) > 0;
    const tujuan = sudahPernah ? (ESKALASI[pemegangAsli] ?? pemegangAsli) : pemegangAsli;

    await beriTahu(pool, {
      peran: tujuan,
      pengajuan_id: p.id,
      jenis: 'menggantung',
      judul: `${p.nomor} sudah ${Math.floor(umurHari)} hari belum ditindak`,
      isi: `${p.judul} — ${rp(p.total_nominal)} — ${p.kota}, ${p.region}.` +
        (tujuan !== pemegangAsli ? ` Menggantung di meja ${pemegangAsli.replace('_', ' ')}.` : ''),
    });

    await q(
      'UPDATE pengajuan SET pengingat_terakhir = now(), pengingat_jumlah = pengingat_jumlah + 1 WHERE id = $1',
      [p.id],
    );
    dikirim++;
  }
  return { diperiksa: rows.length, dikirim, batasHari };
}

export function jadwalkanPengingat() {
  const jalan = async () => {
    try {
      const h = await prosesPengingatMenggantung();
      if (h.dikirim) console.log('Pengingat menggantung:', JSON.stringify(h));
    } catch (e) { console.error('Pengingat menggantung:', e.message); }
  };
  setTimeout(jalan, 40_000).unref?.();
  setInterval(jalan, 3_600_000).unref?.();
}
