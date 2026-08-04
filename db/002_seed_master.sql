-- Migrasi 002: seed master data
-- Wilayah diturunkan dari Data_Target_-_Budget.xlsx (Dashboard Sales), 4 Agustus 2026.
-- 5 region, 11 area, 69 kota. Pemetaan sudah diverifikasi: tidak ada kota di lebih dari satu area.

BEGIN;

-- Region ---------------------------------------------------------------------
INSERT INTO region (kode, nama, profil) VALUES
  ('CENTRAL', 'Central', 'geografis'),
  ('EAST', 'East', 'geografis'),
  ('WEST', 'West', 'geografis'),
  ('MT', 'MT', 'mt'),
  ('ONLINE', 'Online', 'online')
ON CONFLICT (kode) DO NOTHING;

-- Area -----------------------------------------------------------------------
INSERT INTO area (region_id, kode, nama) VALUES
  ((SELECT id FROM region WHERE kode='CENTRAL'), 'CENTRAL_I', 'Central I'),
  ((SELECT id FROM region WHERE kode='CENTRAL'), 'CENTRAL_II', 'Central II'),
  ((SELECT id FROM region WHERE kode='CENTRAL'), 'CENTRAL_III', 'Central III'),
  ((SELECT id FROM region WHERE kode='EAST'), 'EAST_I', 'East I'),
  ((SELECT id FROM region WHERE kode='EAST'), 'EAST_II', 'East II'),
  ((SELECT id FROM region WHERE kode='EAST'), 'EAST_III', 'East III'),
  ((SELECT id FROM region WHERE kode='MT'), 'MT', 'MT'),
  ((SELECT id FROM region WHERE kode='ONLINE'), 'ONLINE', 'Online'),
  ((SELECT id FROM region WHERE kode='WEST'), 'WEST_I', 'West I'),
  ((SELECT id FROM region WHERE kode='WEST'), 'WEST_II', 'West II'),
  ((SELECT id FROM region WHERE kode='WEST'), 'WEST_III', 'West III')
ON CONFLICT (kode) DO NOTHING;

-- Kota -----------------------------------------------------------------------
-- kode_kanonik dipakai memasangkan dengan ringkasan harian dari Dashboard Sales.
INSERT INTO kota (area_id, kode_kanonik, nama) VALUES
  ((SELECT id FROM area WHERE kode='CENTRAL_I'), 'BANDUNG', 'Bandung'),
  ((SELECT id FROM area WHERE kode='CENTRAL_I'), 'BEKASI', 'Bekasi'),
  ((SELECT id FROM area WHERE kode='CENTRAL_I'), 'CIREBON', 'Cirebon'),
  ((SELECT id FROM area WHERE kode='CENTRAL_I'), 'DEPOK', 'Depok'),
  ((SELECT id FROM area WHERE kode='CENTRAL_I'), 'JAKARTA', 'Jakarta'),
  ((SELECT id FROM area WHERE kode='CENTRAL_I'), 'SERANG', 'Serang'),
  ((SELECT id FROM area WHERE kode='CENTRAL_I'), 'SUKABUMI', 'Sukabumi'),
  ((SELECT id FROM area WHERE kode='CENTRAL_I'), 'TANGERANG', 'Tangerang'),
  ((SELECT id FROM area WHERE kode='CENTRAL_I'), 'TASIKMALAYA', 'Tasikmalaya'),
  ((SELECT id FROM area WHERE kode='CENTRAL_II'), 'PATI', 'Pati'),
  ((SELECT id FROM area WHERE kode='CENTRAL_II'), 'PEKALONGAN', 'Pekalongan'),
  ((SELECT id FROM area WHERE kode='CENTRAL_II'), 'PURWOKERTO', 'Purwokerto'),
  ((SELECT id FROM area WHERE kode='CENTRAL_II'), 'SALATIGA', 'Salatiga'),
  ((SELECT id FROM area WHERE kode='CENTRAL_II'), 'SEMARANG', 'Semarang'),
  ((SELECT id FROM area WHERE kode='CENTRAL_II'), 'SOLO', 'Solo'),
  ((SELECT id FROM area WHERE kode='CENTRAL_II'), 'TEGAL', 'Tegal'),
  ((SELECT id FROM area WHERE kode='CENTRAL_II'), 'YOGYAKARTA', 'Yogyakarta'),
  ((SELECT id FROM area WHERE kode='CENTRAL_III'), 'BANJARMASIN', 'Banjarmasin'),
  ((SELECT id FROM area WHERE kode='CENTRAL_III'), 'PONTIANAK', 'Pontianak'),
  ((SELECT id FROM area WHERE kode='CENTRAL_III'), 'SAMARINDA', 'Samarinda'),
  ((SELECT id FROM area WHERE kode='EAST_I'), 'JEMBER', 'Jember'),
  ((SELECT id FROM area WHERE kode='EAST_I'), 'KEDIRI', 'Kediri'),
  ((SELECT id FROM area WHERE kode='EAST_I'), 'LAMONGAN', 'Lamongan'),
  ((SELECT id FROM area WHERE kode='EAST_I'), 'MADIUN', 'Madiun'),
  ((SELECT id FROM area WHERE kode='EAST_I'), 'MADURA', 'Madura'),
  ((SELECT id FROM area WHERE kode='EAST_I'), 'MALANG', 'Malang'),
  ((SELECT id FROM area WHERE kode='EAST_I'), 'SIDOARJO', 'Sidoarjo'),
  ((SELECT id FROM area WHERE kode='EAST_I'), 'SURABAYA', 'Surabaya'),
  ((SELECT id FROM area WHERE kode='EAST_II'), 'DENPASAR', 'Denpasar'),
  ((SELECT id FROM area WHERE kode='EAST_II'), 'FLORES', 'Flores'),
  ((SELECT id FROM area WHERE kode='EAST_II'), 'KUPANG', 'Kupang'),
  ((SELECT id FROM area WHERE kode='EAST_II'), 'LOMBOK', 'Lombok'),
  ((SELECT id FROM area WHERE kode='EAST_II'), 'MAUMERE', 'Maumere'),
  ((SELECT id FROM area WHERE kode='EAST_III'), 'AMBON', 'Ambon'),
  ((SELECT id FROM area WHERE kode='EAST_III'), 'BAU_BAU', 'Bau Bau'),
  ((SELECT id FROM area WHERE kode='EAST_III'), 'GORONTALO', 'Gorontalo'),
  ((SELECT id FROM area WHERE kode='EAST_III'), 'JAYAPURA', 'Jayapura'),
  ((SELECT id FROM area WHERE kode='EAST_III'), 'KENDARI', 'Kendari'),
  ((SELECT id FROM area WHERE kode='EAST_III'), 'LUWUK', 'Luwuk'),
  ((SELECT id FROM area WHERE kode='EAST_III'), 'MAKASSAR', 'Makassar'),
  ((SELECT id FROM area WHERE kode='EAST_III'), 'MANADO', 'Manado'),
  ((SELECT id FROM area WHERE kode='EAST_III'), 'PALU', 'Palu'),
  ((SELECT id FROM area WHERE kode='EAST_III'), 'SORONG', 'Sorong'),
  ((SELECT id FROM area WHERE kode='MT'), 'ALFA_MIDI', 'Alfa Midi'),
  ((SELECT id FROM area WHERE kode='MT'), 'BEAUTE_HAUL', 'Beaute Haul'),
  ((SELECT id FROM area WHERE kode='MT'), 'BORMA', 'Borma'),
  ((SELECT id FROM area WHERE kode='MT'), 'DAN_DAN', 'Dan+Dan'),
  ((SELECT id FROM area WHERE kode='MT'), 'GUARDIAN', 'Guardian'),
  ((SELECT id FROM area WHERE kode='MT'), 'IDOL_MART', 'Idol Mart'),
  ((SELECT id FROM area WHERE kode='MT'), 'INDOGROSIR', 'Indogrosir'),
  ((SELECT id FROM area WHERE kode='MT'), 'LOTTE', 'Lotte'),
  ((SELECT id FROM area WHERE kode='MT'), 'NAGA_SWALAYAN', 'Naga Swalayan'),
  ((SELECT id FROM area WHERE kode='MT'), 'NICESO', 'NiceSo'),
  ((SELECT id FROM area WHERE kode='MT'), 'XIMI', 'Ximi'),
  ((SELECT id FROM area WHERE kode='MT'), 'YOGYA', 'Yogya'),
  ((SELECT id FROM area WHERE kode='MT'), 'YOMART', 'Yomart'),
  ((SELECT id FROM area WHERE kode='ONLINE'), 'SHOPEE', 'Shopee'),
  ((SELECT id FROM area WHERE kode='WEST_I'), 'BATAM', 'Batam'),
  ((SELECT id FROM area WHERE kode='WEST_I'), 'MEDAN', 'Medan'),
  ((SELECT id FROM area WHERE kode='WEST_I'), 'TANJUNG_PINANG', 'Tanjung Pinang'),
  ((SELECT id FROM area WHERE kode='WEST_II'), 'PADANG', 'Padang'),
  ((SELECT id FROM area WHERE kode='WEST_II'), 'PEKANBARU', 'Pekanbaru'),
  ((SELECT id FROM area WHERE kode='WEST_III'), 'BANGKA', 'Bangka'),
  ((SELECT id FROM area WHERE kode='WEST_III'), 'BELITUNG', 'Belitung'),
  ((SELECT id FROM area WHERE kode='WEST_III'), 'JAMBI', 'Jambi'),
  ((SELECT id FROM area WHERE kode='WEST_III'), 'LAMPUNG', 'Lampung'),
  ((SELECT id FROM area WHERE kode='WEST_III'), 'LINGGAU', 'Linggau'),
  ((SELECT id FROM area WHERE kode='WEST_III'), 'MUARA_BUNGO', 'Muara Bungo'),
  ((SELECT id FROM area WHERE kode='WEST_III'), 'PALEMBANG', 'Palembang')
ON CONFLICT (kode_kanonik) DO NOTHING;

-- Kategori budget -------------------------------------------------------------
INSERT INTO kategori_budget (kode, nama, urutan) VALUES
  ('PROMO', 'Promo & Diskon', 1),
  ('TRADE', 'Trade Promo', 2),
  ('EVENT', 'Event & Aktivasi', 3),
  ('DISPLAY', 'Display & POSM', 4),
  ('SAMPLING', 'Sampling & Tester', 5),
  ('DIGITAL', 'Digital & KOL Lokal', 6),
  ('OPS', 'Operasional Sales', 7),
  ('ENTERTAIN', 'Entertain & Relasi', 8)
ON CONFLICT (kode) DO NOTHING;

COMMIT;
