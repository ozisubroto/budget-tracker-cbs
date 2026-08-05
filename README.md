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
npm run web:build         # membangun antarmuka React
npm start                 # API dan antarmuka pada port yang sama
```

Saat mengembangkan antarmuka, jalankan `npm run web:dev` di terminal terpisah —
Vite akan meneruskan panggilan `/api` ke server pada port 3000.

## Antarmuka

React + Vite, disajikan dari proses yang sama dengan API. Satu service, satu
domain: tidak ada CORS yang perlu diatur dan tidak ada tagihan kedua.

Menu disaring per peran — orang hanya melihat yang memang bisa dia kerjakan,
karena menu yang selalu menolak saat diklik lebih membingungkan daripada tidak
ada. Pembatasan tetap ditegakkan di server; penyaringan menu hanya soal
kenyamanan.

| Peran | Layar utama |
|---|---|
| Admin | buat pengajuan, isi LPJ, pantau draft dan revisi |
| Atasan 1, 2, 3 | antrean persetujuan dengan konteks pagu dan cost ratio |
| Finance | master penerima, antrean bayar, pembayaran bertahap, penutupan, verifikasi LPJ |
| Atasan 3 | persetujuan master plan dan dua pengaturan kendali |
| Super Admin | unggah master plan, pengaturan, pengguna, delegasi darurat |

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

## Identitas pengguna

Nama dan jabatan tampil di dropdown akun pojok kanan atas, beserta tombol keluar
aplikasi. Diatur lewat migrasi `db/004_jabatan.sql`, dan dapat diubah lagi oleh
Super Admin lewat `PATCH /api/master/pengguna/:id`.

## Sebelum pengajuan pertama

Master penerima wajib diisi lebih dulu, kalau tidak Admin tidak punya apa pun
untuk dipilih dan pengajuan tidak dapat dikirim. Masuk sebagai **Finance**, buka
menu **Master Penerima**, lalu tambahkan minimal satu penerima.

Tiga jenisnya berperilaku berbeda saat pembayaran, jadi jangan dicampur:

| Jenis | Cara bayar | Sisa kembali lewat |
|---|---|---|
| Vendor | sesuai invoice | Finance menutup, pagu dilepas |
| Reimburse sales | penuh | setoran yang dilaporkan di LPJ |
| Kas | penuh | setoran yang dilaporkan di LPJ |

Rekening tidak pernah diketik di form pengajuan. Admin hanya memilih dari daftar
ini — itu menutup titik rawan yang paling umum, karena satu digit rekening yang
diubah tetap lolos di mata orang yang memeriksa nominal.

## Surat pengajuan

```
GET /api/pengajuan/:id/surat
```

Mengembalikan HTML berukuran A4 siap cetak — kop CBS, alamat kantor, rincian
item, konteks keputusan yang dibekukan, dan lima kotak persetujuan berjenjang.
Di antarmuka tersedia lewat tombol **Cetak surat** pada halaman detail.

**Draft tidak dapat dicetak.** Angkanya belum dibekukan dan nomornya belum
terbit; mencetaknya menghasilkan dokumen berkop resmi yang isinya masih bisa
berubah.

**Tahap yang belum ditindak dibiarkan kosong**, bukan diberi tanda apa pun.
Lembar yang dicetak di tengah alur harus jujur menunjukkan mana yang benar-benar
sudah diputuskan — kotak kosong yang menyerupai kotak terisi mengundang orang
menandatanganinya manual, dan sejak saat itu catatan sistem dan lembar fisik
bisa bercerita berbeda.

**Pengajuan jalur cepat** menandai kotak Atasan 3 sebagai *dilewati*, bukan
*menunggu*, supaya surat yang sudah tuntas tidak terlihat menggantung.

**Persetujuan lewat delegasi** mencetak dua nama: pelaksana dan atas nama siapa.

Logo disematkan sebagai base64 di `src/lib/logo.js`. Surat tidak pernah
bergantung pada berkas eksternal — berkas logo yang hilang saat deploy akan
menghasilkan surat resmi tanpa kop, dan itu baru ketahuan setelah dokumennya
terlanjur dibagikan.

## Lampiran

```
GET    /api/lampiran?pemilik_jenis=pengajuan&pemilik_id=1
POST   /api/lampiran            multipart: berkas, pemilik_jenis, pemilik_id, jenis
GET    /api/lampiran/:id/unduh
DELETE /api/lampiran/:id        hanya pengunggahnya
```

PDF, gambar, Excel, atau Word. Maksimal 10 MB. Nama berkas di penyimpanan
diacak, bukan memakai nama asli — nama asli bisa memuat karakter jalur atau
bertabrakan dengan berkas lain.

**Di Railway, `LAMPIRAN_DIR` wajib menunjuk ke Volume yang di-mount ke `/data`.**
Tanpa itu, seluruh lampiran hilang setiap kali aplikasi di-deploy ulang, sementara
basis datanya tetap menyimpan catatan bahwa lampiran itu ada. Ini satu-satunya
bagian sistem yang masih menyimpan berkas di dalam kontainer; perpindahan ke
penyimpanan objek hanya mengubah tiga fungsi di `src/lib/berkas.js`.

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

## Laporan

```
GET /api/laporan/serapan?tahun=2026[&bulan=&region_id=&versi_id=]
GET /api/laporan/serapan/area      penelusuran ke alokasi area
GET /api/laporan/serapan/kota      pemakaian dan cost ratio per kota
GET /api/laporan/serapan/pengajuan?tahun=&bulan=&region_id=&kategori_id=
GET /api/laporan/pengecualian      over-budget, melebihi pagu, dan jalur cepat
GET /api/laporan/lpj               disiplin, menunggak, selisih rencana vs realisasi
GET /api/laporan/kecepatan         rata-rata hari per tahap dan yang menggantung
GET /api/laporan/serapan/excel     ekspor
GET /api/laporan/pengecualian/excel
```

Seluruh angka berasal dari `src/lib/laporan.js` dan view pagu — satu rumus, satu
sumber. Setiap sel dapat ditelusuri sampai daftar pengajuan pembentuknya lewat
`/serapan/pengajuan`, dan uji otomatis memastikan jumlahnya sama persis.

Parameter `versi_id` menampilkan angka sesuai plafon yang berlaku pada versi
master plan tertentu, bukan yang terkini. Ini pasangan dari penanda revisi
retroaktif: penanda memberi tahu ada perubahan, `versi_id` memperlihatkan angka
aslinya.

## Notifikasi & delegasi

```
GET    /api/notifikasi[?belum=1]        notifikasi milik sendiri
POST   /api/notifikasi/baca             tandai sudah dibaca
GET    /api/notifikasi/antrean          Super Admin, status kirim WhatsApp
POST   /api/notifikasi/antrean/proses   Super Admin, memproses antrean manual
GET    /api/delegasi                    daftar delegasi
POST   /api/delegasi                    approver menunjuk penggantinya sendiri
POST   /api/delegasi/darurat            Super Admin, atas nama orang lain
DELETE /api/delegasi/:id                pembatalan lebih awal
```

**Delegasi mengarah ke atas**: Atasan 1 ke Atasan 2, Atasan 2 ke Atasan 3. Arah
ke bawah ditolak karena menghapus kontrol berlapis. Admin, Atasan 3, dan Finance
tidak punya tujuan alami — penggantinya ditunjuk Super Admin lewat jalur darurat,
untuk kasus berhalangan mendadak yang tidak sempat diatur sendiri.

Super Admin tidak boleh menerima delegasi: ia mengubah aturan mainnya, jadi tidak
boleh sekaligus ikut bermain.

**Jejak menyebut dua nama** — "disetujui oleh Budi atas nama Atasan 1". Inilah
yang membedakan delegasi dari berbagi akun, dan alasan berbagi akun harus
dilarang.

**WhatsApp hanya pengantar.** Notifikasi dalam aplikasi tetap sumber kebenaran;
tidak ada informasi yang hanya tersedia di WhatsApp. Pesan berisi nomor
pengajuan, judul, nominal, dan tautan — tanpa rekening, tanpa lampiran, dan
tanpa tombol approve. Pengiriman lewat antrean latar belakang dengan lima kali
percobaan; matinya gateway tidak menghentikan satu pun alur di aplikasi.

**Tautan dalam pesan tetap mengarah ke pengajuan yang dituju meski peramban
penerima belum menyimpan sesi login.** Membuka tautan tanpa login akan
diarahkan ke halaman masuk, tapi setelah berhasil masuk, halaman mendarat
kembali di pengajuan aslinya — bukan ke Dashboard. Tujuan disimpan sesaat di
`sessionStorage`, bukan lewat parameter URL, supaya tidak tercatat di riwayat
peramban atau ikut ter-share saat tautan disalin ulang.

Seluruh pengiriman dibungkus di `src/lib/wa.js`, fungsi `kirimKeGateway`.
Penggantian vendor hanya mengubah fungsi itu; seluruh kode lain memanggil
`kirimKeGateway(nomor, teks)` tanpa tahu detail vendornya.

**Vendor yang dipakai: Fonnte.** Dua hal khas Fonnte yang berbeda dari asumsi
generik kebanyakan gateway:

- Header `Authorization` diisi token **apa adanya**, bukan `Bearer <token>`
- Fonnte bisa membalas **HTTP 200 tapi tetap gagal** — field `status` di dalam
  body bernilai `false`, misalnya nomor tidak terdaftar di WhatsApp atau device
  terputus. Kegagalan seperti ini ditangkap dan dicatat sebagai `gagal` di
  `notifikasi_kirim`, bukan salah dianggap terkirim hanya karena kode HTTP-nya
  200

### Menguji notifikasi WhatsApp setelah deploy

1. **Isi variabel di Railway**, service Budget Tracker:
   ```
   WA_GATEWAY_URL   = https://api.fonnte.com/send
   WA_GATEWAY_TOKEN = <token device dari dashboard Fonnte>
   APP_URL          = https://<domain-budget-tracker-anda>
   ```
2. **Isi nomor WhatsApp Anda sendiri** ke salah satu akun uji lewat menu
   Pengaturan → Pengguna → Ubah, supaya pesan uji masuk ke ponsel Anda.
3. **Picu kejadian yang menghasilkan notifikasi** — cara termudah: sebagai
   Admin, buat dan kirim satu pengajuan. Approver di tahap pertama akan
   mendapat notifikasi.
4. **Masuk sebagai Super Admin**, buka `GET /api/notifikasi/antrean` untuk
   melihat ringkasan status kirim, lalu `POST /api/notifikasi/antrean/proses`
   untuk memprosesnya segera tanpa menunggu jadwal per menit.
5. **Periksa Deploy Logs Railway** — baris `Antrean WhatsApp: {...}` muncul
   setiap kali pekerja latar belakang memproses antrean, dengan jumlah
   terkirim dan gagal.

Kalau `gagal` bertambah, buka `GET /api/notifikasi/antrean` — field
`gagal_terakhir[].respons` berisi pesan asli dari Fonnte, biasanya cukup untuk
langsung tahu sebabnya (token salah, device terputus, nomor tidak valid).

## Menjalankan uji

```bash
PORT=3000 npm run uji:alur        # 24 pemeriksaan, 8 skenario alur approval
PORT=3000 npm run uji:realisasi   # 20 pemeriksaan, 5 skenario realisasi dan LPJ
PORT=3000 npm run uji:laporan     # 20 pemeriksaan konsistensi laporan
PORT=3000 npm run uji:delegasi    # 19 pemeriksaan delegasi dan notifikasi
PORT=3000 npm run uji:notifikasi  # 10 pemeriksaan celah notifikasi Fase 5
PORT=3000 npm run uji:pengingat   # 9 pemeriksaan pengingat pengajuan menggantung
```

Keduanya membuat pengajuan sungguhan. **Jalankan hanya pada basis data
pengembangan, tidak pernah pada produksi.**

## Status

Rilis pertama lengkap: Fase 0 sampai 5 terbangun, dengan 83 pemeriksaan otomatis.

Yang menunggu di luar aplikasi ini: endpoint ringkasan di Dashboard Sales
(kontraknya di `docs/`), dan pemilihan vendor gateway WhatsApp. Keduanya diisi
lewat variabel lingkungan tanpa perlu deploy ulang, dan aplikasi berjalan normal
selama keduanya kosong. Urutannya ada di
`docs/superpowers/plans/2026-08-04-budget-request-approval-plan.md`.
