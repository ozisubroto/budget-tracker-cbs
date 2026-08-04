# Kontrak Endpoint Ringkasan — Dashboard Sales

**Untuk:** tim yang merawat Dashboard Sales
**Dipakai oleh:** Budget Tracker CBS, ditarik sekali sehari
**Tanggal:** 4 Agustus 2026

---

## Kenapa ini dibutuhkan

Form pengajuan budget menampilkan histori penjualan tiga bulan dan target per kota,
lalu memakainya menghitung cost ratio. Angka itu jadi dasar approver menyetujui atau
menolak, sehingga harus berasal dari satu sumber yang sama dengan laporan penjualan —
bukan diketik ulang.

Budget Tracker **tidak memanggil endpoint ini saat pengguna menekan submit.** Ia
menariknya sekali sehari dan menyimpan salinannya. Jadi kalau Dashboard Sales sedang
mati, lambat, atau sedang diunggah ulang datanya, pengajuan tetap bisa dikirim.

Konsekuensinya untuk Anda: **endpoint ini tidak perlu cepat.** Dipanggil sekali dalam
24 jam. Lebih baik lambat tapi akurat daripada cepat tapi tidak lengkap.

---

## Permintaan

```
GET /api/ringkasan/kota-bulan?tahun=2026
Authorization: Bearer <token statis>
```

Satu parameter, `tahun`. Token statis panjang acak, disimpan sebagai variabel
lingkungan di kedua sisi — bukan ditulis di kode.

---

## Balasan

Status 200, `application/json`, larik objek:

```json
[
  { "kota": "Bandung",   "tahun": 2026, "bulan": 5, "selling_out": 41250000, "target": 45000000 },
  { "kota": "Bandung",   "tahun": 2026, "bulan": 6, "selling_out": 38900000, "target": 46000000 },
  { "kota": "Tangerang", "tahun": 2026, "bulan": 5, "selling_out": 302500738, "target": 310000000 }
]
```

| Field | Tipe | Keterangan |
|---|---|---|
| `kota` | string | Nama kota persis seperti di data target. Lihat bagian pemasangan nama. |
| `tahun` | integer | Tahun anggaran |
| `bulan` | integer | 1 sampai 12 |
| `selling_out` | number | Nilai penjualan dalam **rupiah**, bukan qty |
| `target` | number \| null | Target Selling Out dalam **rupiah**. `null` bila belum ditetapkan. |

Satu baris per kombinasi kota dan bulan. Digabung dari seluruh brand dan channel —
Budget Tracker tidak memecah anggaran per brand.

---

## Empat aturan yang menentukan benar tidaknya angka

**1. Basisnya Selling Out, bukan Selling In.**
Selling In dapat digelembungkan oleh belanja promo yang sedang dinilai itu sendiri.
Budget yang mendorong barang masuk ke distributor menaikkan Selling In, sehingga cost
ratio terlihat membaik padahal barangnya menumpuk di gudang. Selling Out mengukur apa
yang benar-benar terserap pasar.

**2. Target juga harus berbasis Selling Out.**
Ini yang paling sering terlewat. Kalau `selling_out` diambil dari Selling Out tapi
`target` diambil dari target Selling In, cost ratio membandingkan dua hal berbeda dan
angkanya menyesatkan. Bila target Selling Out belum ada di Dashboard Sales, itu perlu
ditambahkan lebih dulu — jangan diakali dengan mengalikan atau memperkirakan.

**3. Nilai rupiah, bukan qty.**
Target dalam karton atau pcs tidak menghasilkan rasio yang berarti saat dibagi dengan
nominal pengajuan.

**4. Kirim seluruh bulan yang ada datanya, termasuk yang nilainya nol.**
Baris yang hilang dan baris bernilai nol punya arti berbeda. Yang pertama berarti
"tidak tahu", yang kedua berarti "tidak ada penjualan". Budget Tracker menampilkan
keduanya secara berbeda kepada approver.

---

## Pemasangan nama kota

Budget Tracker menyimpan 69 kota dengan kode kanonik yang diturunkan dari data target
yang Anda kirim: huruf kapital, karakter non-alfanumerik jadi garis bawah. `Bandung`
menjadi `BANDUNG`, `Alfa Midi` menjadi `ALFA_MIDI`.

Jadi kirim saja nama kota apa adanya seperti di data target. Yang penting **konsisten**
— spasi berlebih, perbedaan huruf besar kecil, dan ejaan berbeda akan menghasilkan
kota yang tidak menemukan pasangan.

Kota yang tidak berpasangan **tidak diabaikan diam-diam**. Budget Tracker mencatatnya
di log sinkronisasi dan menampilkannya sebagai peringatan, karena kota tanpa data akan
membuat setiap pengajuan dari sana wajib mengisi justifikasi cost ratio — terlihat
seperti kesalahan pengguna padahal masalahnya di pemasangan data.

---

## Penanganan galat

| Situasi | Balasan |
|---|---|
| Token salah atau tidak ada | 401 |
| Parameter `tahun` tidak sah | 400 dengan pesan |
| Data tahun itu belum ada | 200 dengan larik kosong |
| Galat internal | 500 |

Larik kosong dan galat 500 ditangani berbeda: yang pertama dianggap jawaban sah, yang
kedua memicu percobaan ulang.

---

## Cara memeriksa sebelum diserahkan

1. Panggil dengan token yang benar, pastikan status 200.
2. Hitung jumlah baris. Untuk 69 kota dan 12 bulan, angka wajarnya mendekati 828.
3. Jumlahkan seluruh `target` tahun 2026. Bandingkan dengan total target di Dashboard
   Sales — harus sama persis. Kalau berbeda, ada kota atau bulan yang tertinggal.
4. Pastikan tidak ada nama kota yang mengandung spasi di awal atau akhir.
5. Panggil dengan token salah, pastikan 401.

Setelah lolos kelimanya, kirimkan alamat endpoint dan tokennya. Budget Tracker
mengisinya sebagai `DASHBOARD_SALES_URL` dan `DASHBOARD_SALES_TOKEN`, lalu penarikan
harian berjalan sendiri.
