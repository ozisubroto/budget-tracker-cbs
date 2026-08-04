import { q, transaksi } from './db.js';

/**
 * Penarikan harian data penjualan dari Dashboard Sales.
 *
 * Ditarik sekali sehari, bukan dipanggil saat submit. Kalau Dashboard Sales mati
 * atau sedang diunggah ulang datanya, pengajuan tetap bisa dikirim - yang dipakai
 * adalah salinan lokal. Keterlambatan maksimal sehari tidak berarti, karena yang
 * dipakai form adalah histori tiga bulan lalu yang memang sudah tidak berubah.
 *
 * Kontrak endpoint: docs/kontrak-endpoint-dashboard-sales.md
 */

const kanon = (s) => String(s ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

export async function sinkronSales(tahun) {
  const url = process.env.DASHBOARD_SALES_URL;
  const token = process.env.DASHBOARD_SALES_TOKEN;
  if (!url || !token) return { dilewati: true, pesan: 'DASHBOARD_SALES_URL atau DASHBOARD_SALES_TOKEN belum diisi.' };

  const { rows: log } = await q(
    'INSERT INTO sinkronisasi_log (mulai) VALUES (now()) RETURNING id',
  );
  const logId = log[0].id;

  try {
    const alamat = new URL(url);
    alamat.searchParams.set('tahun', String(tahun));

    const jawab = await fetch(alamat, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(120_000),
    });
    if (!jawab.ok) throw new Error(`Dashboard Sales membalas ${jawab.status}`);

    const data = await jawab.json();
    if (!Array.isArray(data)) throw new Error('Balasan bukan larik.');

    const { rows: kota } = await q('SELECT id, kode_kanonik FROM kota WHERE aktif');
    const peta = new Map(kota.map((k) => [k.kode_kanonik, k.id]));

    const sah = [];
    const tidakCocok = new Set();
    for (const b of data) {
      const id = peta.get(kanon(b.kota));
      // Kota tanpa pasangan dicatat, tidak dilewati diam-diam. Kota tanpa data
      // membuat setiap pengajuan dari sana wajib mengisi justifikasi cost ratio -
      // terlihat seperti kesalahan pengguna padahal masalahnya di pemasangan data.
      if (!id) { tidakCocok.add(String(b.kota)); continue; }
      const bulan = Number(b.bulan);
      if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) continue;
      sah.push({
        kota_id: id,
        tahun: Number(b.tahun) || tahun,
        bulan,
        selling_out: Number(b.selling_out) || 0,
        target: b.target === null || b.target === undefined ? null : Number(b.target),
      });
    }

    await transaksi(async (c) => {
      await c.query(
        `INSERT INTO sales_kota_bulan (kota_id, tahun, bulan, selling_out, target, ditarik_pada)
         SELECT x.kota_id, x.tahun, x.bulan, x.selling_out, x.target, now()
           FROM jsonb_to_recordset($1::jsonb)
                AS x(kota_id bigint, tahun smallint, bulan smallint, selling_out numeric, target numeric)
         ON CONFLICT (kota_id, tahun, bulan) DO UPDATE
            SET selling_out = EXCLUDED.selling_out,
                target      = EXCLUDED.target,
                ditarik_pada = now()`,
        [JSON.stringify(sah)],
      );
    });

    await q(
      `UPDATE sinkronisasi_log
          SET selesai = now(), jumlah_baris = $1, kota_tidak_cocok = $2, berhasil = TRUE,
              pesan = $3
        WHERE id = $4`,
      [
        sah.length,
        JSON.stringify([...tidakCocok]),
        tidakCocok.size ? `${tidakCocok.size} nama kota tidak menemukan pasangan di master wilayah.` : null,
        logId,
      ],
    );

    return { berhasil: true, baris: sah.length, kotaTidakCocok: [...tidakCocok] };
  } catch (e) {
    await q('UPDATE sinkronisasi_log SET selesai = now(), berhasil = FALSE, pesan = $1 WHERE id = $2', [e.message, logId]);
    return { berhasil: false, pesan: e.message };
  }
}

/**
 * Penjadwal sederhana: memeriksa tiap jam apakah hari ini sudah berhasil ditarik.
 * Tahan terhadap restart - kontainer yang mati dan hidup lagi tidak melewatkan
 * penarikan, dan tidak menariknya dua kali.
 */
export function jadwalkanSinkron() {
  const jalan = async () => {
    if (!process.env.DASHBOARD_SALES_URL) return;
    const { rows } = await q(
      "SELECT 1 FROM sinkronisasi_log WHERE berhasil AND mulai >= date_trunc('day', now()) LIMIT 1",
    );
    if (rows.length) return;
    const hasil = await sinkronSales(new Date().getFullYear());
    console.log('Sinkron Dashboard Sales:', JSON.stringify(hasil));
  };
  setTimeout(jalan, 20_000).unref?.();
  setInterval(jalan, 3_600_000).unref?.();
}
