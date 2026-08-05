-- Migrasi 006: hitungan pengingat
--
-- Tahap pertama "approver, lalu atasannya" sempat salah diimplementasikan
-- sebagai lompat langsung ke atasan, melewati approver yang sebenarnya
-- memegang tahap itu. Kolom ini membedakan pengingat pertama (ke approver)
-- dari pengingat berikutnya (dieskalasi ke atasan bila masih menggantung).

BEGIN;

ALTER TABLE pengajuan ADD COLUMN IF NOT EXISTS pengingat_jumlah SMALLINT NOT NULL DEFAULT 0;

-- Perpindahan tahap yang sah harus mengembalikan hitungan ke nol - approver
-- baru di tahap berikutnya belum pernah diingatkan sama sekali.
COMMENT ON COLUMN pengajuan.pengingat_jumlah IS
  'Direset ke 0 setiap kali status pengajuan berubah - lihat src/lib/pengingat.js';

COMMIT;
