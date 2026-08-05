-- Migrasi 005: pengingat pengajuan menggantung
--
-- Rantai eskalasi: Atasan 1 -> Atasan 2, Atasan 2 -> Atasan 3. Atasan 3 dan
-- Finance ada di puncak rantai masing-masing - tidak ada "atasan" di atas
-- mereka, jadi pengingat untuk keduanya dikirim ulang ke orang yang sama,
-- bukan dieskalasi ke Super Admin. Super Admin sengaja tidak dilibatkan sama
-- sekali di alur ini - ia tidak boleh terlibat keputusan pengajuan.

BEGIN;

-- Menandai kapan pengingat terakhir dikirim untuk status yang sedang berjalan,
-- supaya penjadwal tidak mengirim pengingat berkali-kali dalam satu hari dan
-- tidak kehilangan jejak setelah kontainer di-restart.
ALTER TABLE pengajuan ADD COLUMN IF NOT EXISTS pengingat_terakhir TIMESTAMPTZ;

INSERT INTO pengaturan (kode, nilai, berlaku_sejak, status, diusulkan_oleh, disetujui_oleh, disetujui_pada, catatan)
SELECT 'batas_menggantung_hari', 2, now(), 'berlaku', id, id, now(),
       'Ambang hari sebelum pengajuan yang belum ditindak di satu tahap dianggap menggantung.'
  FROM pengguna WHERE peran = 'super_admin' AND aktif
  AND NOT EXISTS (SELECT 1 FROM pengaturan WHERE kode = 'batas_menggantung_hari' AND status = 'berlaku');

COMMIT;
