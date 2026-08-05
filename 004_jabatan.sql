-- Migrasi 004: jabatan pengguna
--
-- Ditampilkan di pojok kanan atas bersama nama, supaya approver yang membuka
-- aplikasi tahu persis siapa yang sedang bertindak - bukan cuma nama akun.

BEGIN;

ALTER TABLE pengguna ADD COLUMN IF NOT EXISTS jabatan TEXT;

UPDATE pengguna SET nama = 'Iwan Setiawan',  jabatan = 'GM Sales Offline'       WHERE peran = 'atasan_1';
UPDATE pengguna SET nama = 'M. Bayu Andhika', jabatan = 'VP of Commercial'      WHERE peran = 'atasan_2';
UPDATE pengguna SET nama = 'Edy Susanto',     jabatan = 'Chief Revenue Officer' WHERE peran = 'atasan_3';
UPDATE pengguna SET jabatan = 'Admin Anggaran'   WHERE peran = 'admin'        AND jabatan IS NULL;
UPDATE pengguna SET jabatan = 'Finance'          WHERE peran = 'finance'      AND jabatan IS NULL;
UPDATE pengguna SET jabatan = 'Super Admin'      WHERE peran = 'super_admin'  AND jabatan IS NULL;

COMMIT;
