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
   | `CORS_ORIGIN` | alamat frontend |

   Gunakan sintaks referensi `${{Postgres.DATABASE_URL}}`, jangan menyalin nilai
   mentahnya. Kalau basis data diganti, referensinya ikut menyesuaikan sendiri.

   `PORT` diisi Railway sendiri — jangan ditetapkan manual.

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

## Yang belum ada

Fase 1 dan seterusnya: mesin pagu, unggahan master plan, form pengajuan, alur
approval, realisasi, LPJ, laporan, dan notifikasi. Urutannya ada di
`docs/superpowers/plans/2026-08-04-budget-request-approval-plan.md`.
