-- =============================================================================
-- Sistem Pengajuan & Approval Budget - PT. Cahaya Bintang Sempurna
-- Migrasi 001: skema lengkap
--
-- Dibuat lengkap sejak awal, termasuk tabel yang baru dipakai di fase 3 dan 4.
-- Menambah kolom pada tabel yang sudah berisi data pengajuan jauh lebih mahal
-- daripada membuat tabel kosong yang menunggu.
--
-- Konvensi:
--   uang        NUMERIC(18,2)  - eksak, tanpa galat pembulatan floating point
--   periode     tahun SMALLINT + bulan SMALLINT, bukan DATE
--   waktu       TIMESTAMPTZ, disimpan UTC
-- =============================================================================

BEGIN;

-- =============================================================================
-- TIPE
-- =============================================================================

CREATE TYPE peran AS ENUM (
  'admin', 'atasan_1', 'atasan_2', 'atasan_3', 'finance', 'super_admin'
);

CREATE TYPE status_pengajuan AS ENUM (
  'draft',
  'menunggu_atasan_1',
  'menunggu_atasan_2',
  'menunggu_atasan_3',
  'menunggu_finance',
  'menunggu_realisasi',
  'realisasi_sebagian',
  'selesai',
  'perlu_revisi',
  'ditolak',
  'dibatalkan'
);

CREATE TYPE aksi_log AS ENUM (
  'submit', 'approve', 'revisi', 'reject', 'batal', 'minta_pembatalan',
  'rute_otomatis', 'bayar', 'tutup_pembayaran',
  'lpj_submit', 'lpj_approve', 'lpj_revisi'
);

CREATE TYPE jenis_penerima AS ENUM ('vendor', 'reimburse_sales', 'kas');
CREATE TYPE profil_bobot  AS ENUM ('geografis', 'mt', 'online');
CREATE TYPE status_plan   AS ENUM ('draft', 'menunggu_persetujuan', 'berlaku', 'ditolak');
CREATE TYPE status_lpj    AS ENUM ('belum_dibuat', 'draft', 'menunggu_verifikasi', 'perlu_revisi', 'disetujui');
CREATE TYPE tingkat_pagu  AS ENUM ('area', 'region');
CREATE TYPE status_setting AS ENUM ('menunggu_persetujuan', 'berlaku', 'ditolak');
CREATE TYPE kanal_notif   AS ENUM ('aplikasi', 'whatsapp');
CREATE TYPE status_kirim  AS ENUM ('antre', 'terkirim', 'gagal');

-- =============================================================================
-- PENGGUNA & DELEGASI
-- =============================================================================

CREATE TABLE pengguna (
  id            BIGSERIAL PRIMARY KEY,
  nama          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  peran         peran       NOT NULL,
  no_wa         TEXT,
  aktif         BOOLEAN     NOT NULL DEFAULT TRUE,
  dibuat_pada   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu orang per peran. Dijaga di tingkat basis data agar tidak ada dua akun
-- aktif pada peran yang sama tanpa disadari.
CREATE UNIQUE INDEX uq_pengguna_peran_aktif
  ON pengguna (peran) WHERE aktif;

-- Delegasi berjangka. Tidak ada eskalasi otomatis; ini satu-satunya mekanisme
-- saat approver berhalangan. Super Admin boleh membuat baris ini atas nama
-- orang lain, tetapi tidak boleh menjadi penerima delegasi approval.
CREATE TABLE delegasi (
  id               BIGSERIAL PRIMARY KEY,
  dari_pengguna_id BIGINT      NOT NULL REFERENCES pengguna(id),
  ke_pengguna_id   BIGINT      NOT NULL REFERENCES pengguna(id),
  mulai            DATE        NOT NULL,
  selesai          DATE        NOT NULL,
  alasan           TEXT        NOT NULL,
  dibuat_oleh      BIGINT      NOT NULL REFERENCES pengguna(id),
  dibuat_pada      TIMESTAMPTZ NOT NULL DEFAULT now(),
  dibatalkan_pada  TIMESTAMPTZ,
  CONSTRAINT ck_delegasi_rentang CHECK (selesai >= mulai),
  CONSTRAINT ck_delegasi_beda    CHECK (dari_pengguna_id <> ke_pengguna_id)
);

CREATE INDEX ix_delegasi_aktif ON delegasi (dari_pengguna_id, mulai, selesai)
  WHERE dibatalkan_pada IS NULL;

-- =============================================================================
-- MASTER WILAYAH
-- =============================================================================

CREATE TABLE region (
  id     BIGSERIAL PRIMARY KEY,
  kode   TEXT         NOT NULL UNIQUE,
  nama   TEXT         NOT NULL,
  profil profil_bobot NOT NULL,
  aktif  BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE area (
  id        BIGSERIAL PRIMARY KEY,
  region_id BIGINT  NOT NULL REFERENCES region(id),
  kode      TEXT    NOT NULL UNIQUE,
  nama      TEXT    NOT NULL,
  aktif     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX ix_area_region ON area (region_id);

-- kode_kanonik dipakai memasangkan dengan data Dashboard Sales. Satu kota hanya
-- boleh dimiliki satu area; tanpa itu pagu mana yang dipotong menjadi ambigu.
--
-- Perpindahan kota antar area tidak menyimpan riwayat di sini. Aturan "hanya
-- berlaku untuk periode ke depan" dipenuhi karena pengajuan menyimpan area_id
-- dan region_id hasil snapshot saat submit.
CREATE TABLE kota (
  id           BIGSERIAL PRIMARY KEY,
  area_id      BIGINT  NOT NULL REFERENCES area(id),
  kode_kanonik TEXT    NOT NULL UNIQUE,
  nama         TEXT    NOT NULL,
  aktif        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX ix_kota_area ON kota (area_id);

-- =============================================================================
-- MASTER KATEGORI & PENERIMA
-- =============================================================================

-- Kategori yang sudah pernah dipakai tidak boleh dihapus, hanya dinonaktifkan.
-- Ditegakkan oleh foreign key dari pengajuan dan plan.
CREATE TABLE kategori_budget (
  id      BIGSERIAL PRIMARY KEY,
  kode    TEXT     NOT NULL UNIQUE,
  nama    TEXT     NOT NULL,
  urutan  SMALLINT NOT NULL DEFAULT 0,
  aktif   BOOLEAN  NOT NULL DEFAULT TRUE
);

-- Dikelola Finance. Nomor rekening tidak pernah diketik di form pengajuan.
CREATE TABLE penerima (
  id           BIGSERIAL PRIMARY KEY,
  jenis        jenis_penerima NOT NULL,
  nama         TEXT           NOT NULL,
  bank         TEXT,
  no_rekening  TEXT,
  aktif        BOOLEAN        NOT NULL DEFAULT TRUE,
  dibuat_oleh  BIGINT         NOT NULL REFERENCES pengguna(id),
  dibuat_pada  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT ck_penerima_rekening CHECK (
    jenis = 'kas' OR (bank IS NOT NULL AND no_rekening IS NOT NULL)
  )
);

-- =============================================================================
-- PENGATURAN BERNILAI RIWAYAT
-- =============================================================================

-- Satu baris per perubahan, bukan satu baris per pengaturan. Pengajuan lama
-- tetap terbaca dengan aturan yang berlaku saat itu.
--
-- Kode yang wajib disetujui Atasan 3 sebelum berlaku:
--   batas_pagu_atasan_2, ambang_cost_ratio
-- Kode yang langsung berlaku setelah diubah Super Admin:
--   batas_waktu_lpj_hari, ambang_penutupan_persen, ambang_penutupan_rupiah
CREATE TABLE pengaturan (
  id             BIGSERIAL PRIMARY KEY,
  kode           TEXT           NOT NULL,
  nilai          NUMERIC(18,4)  NOT NULL,
  berlaku_sejak  TIMESTAMPTZ    NOT NULL,
  status         status_setting NOT NULL DEFAULT 'menunggu_persetujuan',
  diusulkan_oleh BIGINT         NOT NULL REFERENCES pengguna(id),
  diusulkan_pada TIMESTAMPTZ    NOT NULL DEFAULT now(),
  disetujui_oleh BIGINT         REFERENCES pengguna(id),
  disetujui_pada TIMESTAMPTZ,
  catatan        TEXT
);

CREATE INDEX ix_pengaturan_kode ON pengaturan (kode, berlaku_sejak DESC)
  WHERE status = 'berlaku';

-- =============================================================================
-- MASTER PLANNING BUDGET
-- =============================================================================

-- Versi pertama sebuah tahun anggaran boleh berlaku tanpa persetujuan selama
-- belum ada satu pun pengajuan tercatat pada tahun tersebut. Versi berikutnya
-- wajib disetujui Atasan 3. Pemicunya fakta yang dapat diperiksa sistem, bukan
-- tanggal atau niat.
CREATE TABLE plan_versi (
  id             BIGSERIAL PRIMARY KEY,
  tahun          SMALLINT    NOT NULL,
  versi          SMALLINT    NOT NULL,
  status         status_plan NOT NULL DEFAULT 'draft',
  alasan         TEXT,
  diunggah_oleh  BIGINT      NOT NULL REFERENCES pengguna(id),
  diunggah_pada  TIMESTAMPTZ NOT NULL DEFAULT now(),
  disetujui_oleh BIGINT      REFERENCES pengguna(id),
  disetujui_pada TIMESTAMPTZ,
  berlaku_sejak  TIMESTAMPTZ,
  UNIQUE (tahun, versi)
);

-- Hanya satu versi yang berlaku per tahun. Plan lama tetap berlaku sampai versi
-- baru disetujui, sehingga tidak ada masa kosong.
CREATE UNIQUE INDEX uq_plan_versi_berlaku
  ON plan_versi (tahun) WHERE status = 'berlaku';

-- Plafon induk, angka resmi perusahaan. Region adalah batas akuntansi keras:
-- tidak ada mekanisme pinjam antar region, agar KPI region tidak saling
-- mengganggu.
CREATE TABLE plan_region (
  id          BIGSERIAL PRIMARY KEY,
  versi_id    BIGINT        NOT NULL REFERENCES plan_versi(id) ON DELETE CASCADE,
  region_id   BIGINT        NOT NULL REFERENCES region(id),
  kategori_id BIGINT        NOT NULL REFERENCES kategori_budget(id),
  tahun       SMALLINT      NOT NULL,
  bulan       SMALLINT      NOT NULL,
  plafon      NUMERIC(18,2) NOT NULL,
  UNIQUE (versi_id, region_id, kategori_id, tahun, bulan),
  CONSTRAINT ck_plan_region_bulan  CHECK (bulan BETWEEN 1 AND 12),
  CONSTRAINT ck_plan_region_plafon CHECK (plafon >= 0)
);

-- Alokasi turunan, acuan pembagian. Boleh tertembus oleh pengajuan selama sisa
-- region masih cukup. Jumlah seluruh area dalam satu region harus persis sama
-- dengan plafon region - divalidasi saat unggah, bukan oleh constraint, karena
-- aturannya lintas baris.
CREATE TABLE plan_area (
  id          BIGSERIAL PRIMARY KEY,
  versi_id    BIGINT        NOT NULL REFERENCES plan_versi(id) ON DELETE CASCADE,
  area_id     BIGINT        NOT NULL REFERENCES area(id),
  kategori_id BIGINT        NOT NULL REFERENCES kategori_budget(id),
  tahun       SMALLINT      NOT NULL,
  bulan       SMALLINT      NOT NULL,
  alokasi     NUMERIC(18,2) NOT NULL,
  UNIQUE (versi_id, area_id, kategori_id, tahun, bulan),
  CONSTRAINT ck_plan_area_bulan   CHECK (bulan BETWEEN 1 AND 12),
  CONSTRAINT ck_plan_area_alokasi CHECK (alokasi >= 0)
);

CREATE INDEX ix_plan_region_lookup ON plan_region (versi_id, region_id, kategori_id, tahun, bulan);
CREATE INDEX ix_plan_area_lookup   ON plan_area   (versi_id, area_id,   kategori_id, tahun, bulan);

-- =============================================================================
-- DATA PENJUALAN DARI DASHBOARD SALES
-- =============================================================================

-- Ditarik sekali sehari, bukan dipanggil saat submit. Submit tetap jalan meski
-- Dashboard Sales bermasalah. Basis Selling Out, bukan Selling In: Selling In
-- dapat digelembungkan oleh belanja promo yang sedang dinilai itu sendiri.
CREATE TABLE sales_kota_bulan (
  kota_id     BIGINT        NOT NULL REFERENCES kota(id),
  tahun       SMALLINT      NOT NULL,
  bulan       SMALLINT      NOT NULL,
  selling_out NUMERIC(18,2) NOT NULL DEFAULT 0,
  target      NUMERIC(18,2),
  ditarik_pada TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (kota_id, tahun, bulan),
  CONSTRAINT ck_skb_bulan CHECK (bulan BETWEEN 1 AND 12)
);

-- Kota yang tidak menemukan pasangan wajib dilaporkan, bukan dilewati diam-diam.
CREATE TABLE sinkronisasi_log (
  id                BIGSERIAL PRIMARY KEY,
  mulai             TIMESTAMPTZ NOT NULL DEFAULT now(),
  selesai           TIMESTAMPTZ,
  jumlah_baris      INTEGER,
  kota_tidak_cocok  JSONB,
  berhasil          BOOLEAN,
  pesan             TEXT
);

-- =============================================================================
-- PENGAJUAN
-- =============================================================================

CREATE TABLE pengajuan (
  id          BIGSERIAL PRIMARY KEY,
  nomor       TEXT             NOT NULL UNIQUE,  -- BR/YYYY/MM/NNNN
  versi_no    SMALLINT         NOT NULL DEFAULT 1,
  status      status_pengajuan NOT NULL DEFAULT 'draft',

  -- Wilayah hasil snapshot saat submit. Perpindahan kota antar area di kemudian
  -- hari tidak menggeser angka laporan periode sebelumnya.
  kota_id     BIGINT   NOT NULL REFERENCES kota(id),
  area_id     BIGINT   NOT NULL REFERENCES area(id),
  region_id   BIGINT   NOT NULL REFERENCES region(id),

  kategori_id    BIGINT   NOT NULL REFERENCES kategori_budget(id),
  periode_tahun  SMALLINT NOT NULL,
  periode_bulan  SMALLINT NOT NULL,

  judul       TEXT NOT NULL,
  tujuan      TEXT,
  tgl_mulai   DATE NOT NULL,
  tgl_selesai DATE NOT NULL,
  lokasi      TEXT,

  -- Dihitung dari rincian item, tidak pernah diketik.
  total_nominal NUMERIC(18,2) NOT NULL DEFAULT 0,

  penerima_id     BIGINT REFERENCES penerima(id),
  tgl_dibutuhkan  DATE,

  -- Snapshot saat submit. Tanpa ini, approver di hari berbeda melihat angka
  -- berbeda untuk pengajuan yang sama, dan keputusannya tidak dapat diaudit.
  snap_data_per          DATE,
  snap_histori_total     NUMERIC(18,2),
  snap_histori_rata2     NUMERIC(18,2),
  snap_target            NUMERIC(18,2),
  snap_cost_ratio_ini    NUMERIC(10,6),
  snap_cost_ratio_periode NUMERIC(10,6),
  snap_ambang_cost_ratio NUMERIC(10,6),
  snap_batas_pagu        NUMERIC(18,2),
  snap_sisa_area         NUMERIC(18,2),
  snap_sisa_region       NUMERIC(18,2),
  snap_plan_versi_id     BIGINT REFERENCES plan_versi(id),

  melebihi_pagu          BOOLEAN NOT NULL DEFAULT FALSE,
  alasan_melebihi_pagu   TEXT,
  justifikasi_cost_ratio TEXT,

  jalur_cepat            BOOLEAN NOT NULL DEFAULT FALSE,
  minta_pembatalan       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Penutupan pembayaran vendor di bawah nominal disetujui.
  ditutup_pada     TIMESTAMPTZ,
  ditutup_oleh     BIGINT REFERENCES pengguna(id),
  alasan_penutupan TEXT,

  status_lpj   status_lpj NOT NULL DEFAULT 'belum_dibuat',
  batas_lpj    DATE,

  dibuat_oleh  BIGINT      NOT NULL REFERENCES pengguna(id),
  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now(),
  disubmit_pada TIMESTAMPTZ,
  selesai_pada  TIMESTAMPTZ,

  CONSTRAINT ck_pengajuan_bulan   CHECK (periode_bulan BETWEEN 1 AND 12),
  CONSTRAINT ck_pengajuan_tanggal CHECK (tgl_selesai >= tgl_mulai),
  CONSTRAINT ck_pengajuan_nominal CHECK (total_nominal >= 0),
  -- Melebihi pagu wajib beralasan.
  CONSTRAINT ck_pengajuan_alasan_pagu CHECK (
    NOT melebihi_pagu OR status = 'draft' OR alasan_melebihi_pagu IS NOT NULL
  )
);

CREATE INDEX ix_pengajuan_status   ON pengajuan (status);
CREATE INDEX ix_pengajuan_periode  ON pengajuan (region_id, kategori_id, periode_tahun, periode_bulan);
CREATE INDEX ix_pengajuan_area     ON pengajuan (area_id, kategori_id, periode_tahun, periode_bulan);
CREATE INDEX ix_pengajuan_kota     ON pengajuan (kota_id, periode_tahun, periode_bulan);
CREATE INDEX ix_pengajuan_lpj      ON pengajuan (status_lpj, batas_lpj)
  WHERE status_lpj IN ('belum_dibuat', 'draft', 'perlu_revisi');

CREATE TABLE pengajuan_item (
  id            BIGSERIAL PRIMARY KEY,
  pengajuan_id  BIGINT        NOT NULL REFERENCES pengajuan(id) ON DELETE CASCADE,
  urutan        SMALLINT      NOT NULL DEFAULT 0,
  nama          TEXT          NOT NULL,
  qty           NUMERIC(14,2) NOT NULL,
  satuan        TEXT,
  harga_satuan  NUMERIC(18,2) NOT NULL,
  subtotal      NUMERIC(18,2) GENERATED ALWAYS AS (qty * harga_satuan) STORED,
  CONSTRAINT ck_item_qty   CHECK (qty > 0),
  CONSTRAINT ck_item_harga CHECK (harga_satuan > 0)
);

CREATE INDEX ix_item_pengajuan ON pengajuan_item (pengajuan_id);

-- Jejak audit. Menyebut dua nama bila lewat delegasi: pelaksana dan atas nama
-- siapa. Inilah yang membedakan delegasi dari berbagi akun.
CREATE TABLE pengajuan_log (
  id            BIGSERIAL PRIMARY KEY,
  pengajuan_id  BIGINT           NOT NULL REFERENCES pengajuan(id) ON DELETE CASCADE,
  versi_no      SMALLINT         NOT NULL,
  status_dari   status_pengajuan,
  status_ke     status_pengajuan NOT NULL,
  aksi          aksi_log         NOT NULL,
  oleh          BIGINT           REFERENCES pengguna(id),
  atas_nama     BIGINT           REFERENCES pengguna(id),
  alasan        TEXT,
  waktu         TIMESTAMPTZ      NOT NULL DEFAULT now(),
  -- Revisi dan reject wajib beralasan.
  CONSTRAINT ck_log_alasan CHECK (
    aksi NOT IN ('revisi', 'reject') OR alasan IS NOT NULL
  )
);

CREATE INDEX ix_log_pengajuan ON pengajuan_log (pengajuan_id, waktu);
CREATE INDEX ix_log_waktu     ON pengajuan_log (waktu);

-- Salinan isi pengajuan per versi, untuk menampilkan daftar perubahan antar
-- versi kepada approver yang sudah menyetujui versi sebelumnya.
CREATE TABLE pengajuan_versi_snapshot (
  id           BIGSERIAL PRIMARY KEY,
  pengajuan_id BIGINT      NOT NULL REFERENCES pengajuan(id) ON DELETE CASCADE,
  versi_no     SMALLINT    NOT NULL,
  isi          JSONB       NOT NULL,
  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pengajuan_id, versi_no)
);

-- =============================================================================
-- PENGUNCIAN PAGU
-- =============================================================================

-- Penguncian bertingkat: sebanyak yang tersedia di area sendiri, sisanya di
-- tingkat region. Dengan begitu dua pengajuan dari dua area berbeda tidak bisa
-- sama-sama mengklaim sisa region yang sama.
--
-- Pinjaman antar area dicatat kolektif, tanpa menunjuk area sumber - alokasi
-- area tidak memiliki konsekuensi KPI.
CREATE TABLE pagu_hold (
  id           BIGSERIAL PRIMARY KEY,
  pengajuan_id BIGINT        NOT NULL REFERENCES pengajuan(id) ON DELETE CASCADE,
  tingkat      tingkat_pagu  NOT NULL,
  region_id    BIGINT        NOT NULL REFERENCES region(id),
  area_id      BIGINT        REFERENCES area(id),
  kategori_id  BIGINT        NOT NULL REFERENCES kategori_budget(id),
  tahun        SMALLINT      NOT NULL,
  bulan        SMALLINT      NOT NULL,
  nominal      NUMERIC(18,2) NOT NULL,
  aktif        BOOLEAN       NOT NULL DEFAULT TRUE,
  dibuat_pada  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  dilepas_pada TIMESTAMPTZ,
  CONSTRAINT ck_hold_nominal CHECK (nominal > 0),
  CONSTRAINT ck_hold_area    CHECK (tingkat = 'region' OR area_id IS NOT NULL)
);

CREATE INDEX ix_hold_region ON pagu_hold (region_id, kategori_id, tahun, bulan) WHERE aktif;
CREATE INDEX ix_hold_area   ON pagu_hold (area_id,   kategori_id, tahun, bulan) WHERE aktif;

-- =============================================================================
-- PEMBAYARAN
-- =============================================================================

-- Boleh bertahap. Total tidak pernah boleh melebihi nominal disetujui - batas
-- atas keras, tanpa pengecualian, untuk semua jenis penerima. Ditegakkan di
-- lapisan aplikasi karena aturannya lintas baris.
CREATE TABLE pembayaran (
  id            BIGSERIAL PRIMARY KEY,
  pengajuan_id  BIGINT        NOT NULL REFERENCES pengajuan(id),
  tanggal       DATE          NOT NULL,
  nominal       NUMERIC(18,2) NOT NULL,
  metode        TEXT          NOT NULL,
  no_referensi  TEXT,
  dicatat_oleh  BIGINT        NOT NULL REFERENCES pengguna(id),
  dicatat_pada  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_bayar_nominal CHECK (nominal > 0)
);

CREATE INDEX ix_bayar_pengajuan ON pembayaran (pengajuan_id);

-- =============================================================================
-- LPJ
-- =============================================================================

-- Wajib untuk seluruh jenis penerima. Untuk vendor, sisa selalu nol dan yang
-- dipertanggungjawabkan adalah pelaksanaan program.
--
-- Verifikasi Finance hanya punya Approve dan Revisi. Tidak ada Reject: LPJ yang
-- salah harus diperbaiki sampai benar, karena uangnya sudah keluar.
CREATE TABLE lpj (
  id             BIGSERIAL PRIMARY KEY,
  pengajuan_id   BIGINT        NOT NULL UNIQUE REFERENCES pengajuan(id),
  status         status_lpj    NOT NULL DEFAULT 'draft',
  total_terpakai NUMERIC(18,2) NOT NULL DEFAULT 0,
  sisa_dana      NUMERIC(18,2) NOT NULL DEFAULT 0,
  catatan        TEXT,
  disubmit_pada  TIMESTAMPTZ,
  diverifikasi_oleh BIGINT      REFERENCES pengguna(id),
  diverifikasi_pada TIMESTAMPTZ,
  dibuat_oleh    BIGINT        NOT NULL REFERENCES pengguna(id),
  dibuat_pada    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT ck_lpj_terpakai CHECK (total_terpakai >= 0),
  CONSTRAINT ck_lpj_sisa     CHECK (sisa_dana >= 0)
);

CREATE TABLE lpj_item (
  id                BIGSERIAL PRIMARY KEY,
  lpj_id            BIGINT        NOT NULL REFERENCES lpj(id) ON DELETE CASCADE,
  pengajuan_item_id BIGINT        NOT NULL REFERENCES pengajuan_item(id),
  qty_aktual        NUMERIC(14,2) NOT NULL DEFAULT 0,
  harga_aktual      NUMERIC(18,2) NOT NULL DEFAULT 0,
  subtotal_aktual   NUMERIC(18,2) GENERATED ALWAYS AS (qty_aktual * harga_aktual) STORED,
  catatan           TEXT,
  UNIQUE (lpj_id, pengajuan_item_id),
  CONSTRAINT ck_lpj_item_qty   CHECK (qty_aktual >= 0),
  CONSTRAINT ck_lpj_item_harga CHECK (harga_aktual >= 0)
);

-- =============================================================================
-- LAMPIRAN
-- =============================================================================

-- Disimpan di penyimpanan objek, terpisah dari basis data. Lampiran tumbuh jauh
-- lebih cepat daripada datanya.
CREATE TABLE lampiran (
  id            BIGSERIAL PRIMARY KEY,
  pemilik_jenis TEXT        NOT NULL,  -- pengajuan | pembayaran | lpj
  pemilik_id    BIGINT      NOT NULL,
  jenis         TEXT        NOT NULL,  -- penawaran | invoice | bukti_transfer | nota | bukti_setor | dokumentasi
  nama_berkas   TEXT        NOT NULL,
  lokasi        TEXT        NOT NULL,
  ukuran_byte   BIGINT,
  mime          TEXT,
  diunggah_oleh BIGINT      NOT NULL REFERENCES pengguna(id),
  diunggah_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_lampiran_pemilik ON lampiran (pemilik_jenis, pemilik_id);

-- =============================================================================
-- NOTIFIKASI
-- =============================================================================

-- Notifikasi dalam aplikasi adalah sumber kebenaran. WhatsApp hanya pengantar:
-- tidak boleh ada informasi yang hanya tersedia di sana.
CREATE TABLE notifikasi (
  id           BIGSERIAL PRIMARY KEY,
  pengguna_id  BIGINT      NOT NULL REFERENCES pengguna(id),
  pengajuan_id BIGINT      REFERENCES pengajuan(id) ON DELETE CASCADE,
  jenis        TEXT        NOT NULL,
  judul        TEXT        NOT NULL,
  isi          TEXT,
  dibaca_pada  TIMESTAMPTZ,
  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_notif_pengguna ON notifikasi (pengguna_id, dibuat_pada DESC);
CREATE INDEX ix_notif_belum    ON notifikasi (pengguna_id) WHERE dibaca_pada IS NULL;

-- Status kirim dicatat sendiri, tidak bergantung dasbor vendor - dasbor itu
-- akan hilang saat penyedia diganti.
CREATE TABLE notifikasi_kirim (
  id             BIGSERIAL PRIMARY KEY,
  notifikasi_id  BIGINT       NOT NULL REFERENCES notifikasi(id) ON DELETE CASCADE,
  kanal          kanal_notif  NOT NULL,
  tujuan         TEXT         NOT NULL,
  status         status_kirim NOT NULL DEFAULT 'antre',
  percobaan      SMALLINT     NOT NULL DEFAULT 0,
  terakhir_dicoba TIMESTAMPTZ,
  respons        TEXT
);

CREATE INDEX ix_kirim_antre ON notifikasi_kirim (status, terakhir_dicoba)
  WHERE status IN ('antre', 'gagal');

-- =============================================================================
-- AUDIT MASTER DATA
-- =============================================================================

-- Seluruh tindakan Super Admin muncul di sini. Dia mengubah aturan mainnya,
-- jadi dia tidak boleh sekaligus ikut bermain - kompensasinya keterlihatan.
CREATE TABLE audit_master (
  id        BIGSERIAL PRIMARY KEY,
  tabel     TEXT        NOT NULL,
  record_id BIGINT,
  aksi      TEXT        NOT NULL,  -- insert | update | delete
  oleh      BIGINT      NOT NULL REFERENCES pengguna(id),
  sebelum   JSONB,
  sesudah   JSONB,
  waktu     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_audit_master_waktu ON audit_master (waktu DESC);
CREATE INDEX ix_audit_master_oleh  ON audit_master (oleh, waktu DESC);

COMMIT;
