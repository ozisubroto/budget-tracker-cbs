# Budget Tracker CBS — Fase 0

Kerangka aplikasi pengajuan dan approval budget PT. Cahaya Bintang Sempurna.
Dokumen desain: `docs/superpowers/specs/2026-08-04-budget-request-approval-design.md`

## Isi fase ini

- Skema basis data lengkap, termasuk tabel yang baru dipakai di fase 3 dan 4
- Seed master wilayah dari Dashboard Sales: 5 region, 11 area, 69 kota
- Seed kategori budget dan nilai awal pengaturan
- Autentikasi, enam peran, dan peran efektif lewat delegasi berjangka

## Menjalankan

```bash
cp .env.example .env      # isi DATABASE_URL dan JWT_SECRET
npm install
npm run migrate           # membuat skema dan mengisi master data
npm run seed:pengguna     # membuat enam akun, mencetak sandi awal sekali
npm start
```

Periksa `GET /sehat` sebelum lanjut. Bila mengembalikan 503, `DATABASE_URL` salah
atau basis data belum terjangkau.

## Unggah ke GitHub

```bash
git init
git add .
git commit -m "Fase 0: skema, master data, autentikasi"
git branch -M main
git remote add origin https://github.com/<akun>/budget-tracker-cbs.git
git push -u origin main
```

`.gitignore` sudah menahan `node_modules` dan `.env`. Yang ikut terkirim hanya
`.env.example`, jadi tidak ada rahasia yang bocor ke repositori.

## Menjalankan di Railway

1. **New Project → Deploy from GitHub repo**, pilih repositori ini.
2. **Add Service → Database → PostgreSQL**, di proyek yang sama.
3. Buka tab **Variables** pada service aplikasi, isi:

   | Variabel | Nilai |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `JWT_SECRET` | hasil `openssl rand -base64 48` |
   | `JWT_TTL` | `12h` |
   | `CORS_ORIGIN` | alamat asal frontend, lihat catatan di bawah |

   Gunakan sintaks referensi `${{Postgres.DATABASE_URL}}`, jangan menyalin nilai
   mentahnya. Kalau basis data diganti, referensinya ikut menyesuaikan sendiri.

   `PORT` diisi Railway sendiri — jangan ditetapkan manual.

   **Soal `CORS_ORIGIN`.** Isinya alamat halaman web yang memanggil API ini,
   bukan alamat API-nya sendiri. Mengisinya dengan domain service backend adalah
   kesalahan yang paling sering terjadi dan tidak berefek apa pun.

   Selama Fase 0 belum ada frontend, jadi isi dengan alamat pengembangan lokal:
   `http://localhost:5173` — port bawaan Vite. Setelah frontend di-deploy nanti,
   ganti dengan domain service frontend, misalnya
   `https://budget-cbs.up.railway.app`.

   Boleh diisi beberapa alamat sekaligus, dipisah koma tanpa spasi, misalnya
   `http://localhost:5173,https://budget-cbs.up.railway.app` — berguna saat Anda
   masih menguji dari komputer sendiri sementara versi produksi sudah jalan.
   Tulis tanpa garis miring di akhir, karena pencocokannya persis huruf per
   huruf.

   Kalau nanti muncul galat CORS di konsol peramban, penyebabnya hampir selalu
   satu dari tiga ini: alamatnya berbeda protokol (`http` versus `https`), ada
   garis miring di akhir, atau nomor port-nya tidak sama.

4. **Generate Domain** pada tab Settings, lalu buka `/sehat`. Balasan `sehat`
   berarti aplikasi dan basis data sudah tersambung.
5. Sekali saja, buat enam akun awal:

   ```bash
   railway run npm run seed:pengguna
   ```

   Sandi awal tercetak sekali dan tidak dapat dilihat lagi. Salin, bagikan lewat
   kanal aman, lalu minta setiap pemilik menggantinya.

`railway.json` sudah mengatur migrasi berjalan otomatis sebagai pre-deploy
command, pemeriksaan kesehatan ke `/sehat`, dan restart saat gagal. Skema selalu
mengikuti kode yang di-deploy tanpa langkah manual.

## Catatan infrastruktur

**Basis data tidak diletakkan di volume.** PostgreSQL terkelola memberi cadangan
otomatis dan pemulihan titik waktu — ini aplikasi uang, dan riwayat approval
tidak punya sumber lain untuk diunggah ulang bila hilang.

**Lampiran disimpan di penyimpanan objek**, bukan di kontainer atau volume yang
sama dengan basis data. Berkas tumbuh jauh lebih cepat daripada datanya, dan
penyimpanan yang penuh akan ikut mematikan basis data.

**Uji pemulihan cadangan sekali** sebelum dipakai sungguhan. Cadangan yang belum
pernah diuji bukan cadangan.

## Mengunggah master plan

Hanya Super Admin. Berkas Excel wajib punya sheet `Plafon Region` dan
`Alokasi Area` dengan kolom Region, Area, Kategori, Bulan, dan nominalnya.

```bash
curl -X POST https://<domain>/api/plan/unggah \
  -H "authorization: Bearer <token>" \
  -F tahun=2026 -F "berkas=@Master_Plan_Budget_2026_CBS.xlsx"
```

Validasi menolak seluruh berkas bila ada satu baris bermasalah, dan menyebutkan
baris mana. Yang diperiksa: nama region, area, dan kategori harus ada di master;
area harus benar-benar milik region yang disebut; setiap region dan kategori
harus punya dua belas bulan; dan jumlah alokasi area harus **persis sama** dengan
plafon region untuk setiap kombinasi.

Versi pertama sebuah tahun langsung berlaku selama belum ada pengajuan tercatat
di tahun itu. Setelah pengajuan pertama masuk, versi berikutnya wajib disetujui
Atasan 3 lewat `POST /api/plan/versi/:id/setujui`, dan plafon baru tidak boleh
turun di bawah yang sudah terserap.

## Memantau pagu

```
GET /api/pagu/ringkasan?tahun=2026
GET /api/pagu/region?tahun=2026&bulan=8
GET /api/pagu/area?tahun=2026&bulan=8&region_id=3
```

Seluruh angka berasal dari view `v_pagu_region` dan `v_pagu_area` — satu rumus,
satu sumber. Tidak ada layar atau laporan yang boleh menghitung ulang sendiri.

## Realisasi & LPJ

```
POST /api/pengajuan/:id/bayar        Finance, boleh bertahap
POST /api/pengajuan/:id/tutup        Finance, khusus vendor di bawah invoice
POST /api/lpj/:id                    Admin, mengirim LPJ
POST /api/lpj/:id/verifikasi         Finance, approve atau revisi
GET  /api/lpj?menunggak=1            daftar LPJ lewat batas waktu
```

**Batas atas keras.** Total pembayaran tidak pernah boleh melebihi nominal
disetujui, untuk semua jenis penerima, tanpa pengecualian.

**Batas bawah berbeda menurut pemegang uang.** Vendor dibayar sesuai invoice dan
sisanya dilepas oleh Finance lewat penutupan. Reimburse dan kas dibayar penuh,
sisanya kembali lewat setoran yang dilaporkan di LPJ.

**LPJ hanya punya Approve dan Revisi.** Tidak ada Reject: LPJ yang salah harus
diperbaiki sampai benar, karena uangnya sudah keluar.

**Kota dengan LPJ menunggak tidak dapat mengajukan yang baru.** Ini kontrol
termurah dan paling ampuh, karena konsekuensinya langsung terasa oleh yang
menunda.

## Menjalankan uji

```bash
PORT=3000 npm run uji:alur        # 24 pemeriksaan, 8 skenario alur approval
PORT=3000 npm run uji:realisasi   # 20 pemeriksaan, 5 skenario realisasi dan LPJ
```

Keduanya membuat pengajuan sungguhan. **Jalankan hanya pada basis data
pengembangan, tidak pernah pada produksi.**

## Yang belum ada

Fase 4 dan seterusnya: empat laporan manajemen, dan notifikasi WhatsApp beserta
delegasi berjangka. Notifikasi dalam aplikasi sudah berfungsi. Urutannya ada di
`docs/superpowers/plans/2026-08-04-budget-request-approval-plan.md`.
