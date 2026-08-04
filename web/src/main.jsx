import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './gaya.css';
import { sesi } from './api.js';
import Masuk from './halaman/Masuk.jsx';
import Dashboard from './halaman/Dashboard.jsx';
import { DaftarPengajuan, PengajuanBaru } from './halaman/Pengajuan.jsx';
import DetailPengajuan from './halaman/Detail.jsx';
import { Realisasi, Lpj } from './halaman/Keuangan.jsx';
import { Pagu, MasterPlan } from './halaman/Anggaran.jsx';
import Laporan from './halaman/Laporan.jsx';
import { Pengaturan, Delegasi, Notifikasi } from './halaman/Sistem.jsx';
import Penerima from './halaman/Penerima.jsx';

const Terkunci = ({ anak }) => (sesi.token ? anak : <Navigate to="/masuk" replace />);
// Peran yang tidak berhak diarahkan pulang, bukan diberi layar galat - menu sudah
// disaring per peran, jadi ini hanya pengaman kalau alamatnya diketik langsung.
const Batasi = ({ peran, anak }) => (peran.includes(sesi.pengguna?.peran) ? anak : <Navigate to="/" replace />);

createRoot(document.getElementById('akar')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/masuk" element={<Masuk />} />
        <Route path="/" element={<Terkunci anak={<Dashboard />} />} />
        <Route path="/pengajuan" element={<Terkunci anak={<DaftarPengajuan />} />} />
        <Route path="/pengajuan/baru" element={<Terkunci anak={<Batasi peran={['admin']} anak={<PengajuanBaru />} />} />} />
        <Route path="/pengajuan/:id" element={<Terkunci anak={<DetailPengajuan />} />} />
        <Route path="/persetujuan" element={<Terkunci anak={<DaftarPengajuan />} />} />
        <Route path="/realisasi" element={<Terkunci anak={<Batasi peran={['finance']} anak={<Realisasi />} />} />} />
        <Route path="/lpj" element={<Terkunci anak={<Lpj />} />} />
        <Route path="/pagu" element={<Terkunci anak={<Pagu />} />} />
        <Route path="/master-plan" element={<Terkunci anak={<Batasi peran={['super_admin', 'atasan_3']} anak={<MasterPlan />} />} />} />
        <Route path="/laporan" element={<Terkunci anak={<Laporan />} />} />
        <Route path="/delegasi" element={<Terkunci anak={<Delegasi />} />} />
        <Route path="/notifikasi" element={<Terkunci anak={<Notifikasi />} />} />
        <Route path="/penerima" element={<Terkunci anak={<Penerima />} />} />
        <Route path="/pengaturan" element={<Terkunci anak={<Batasi peran={['super_admin', 'atasan_3']} anak={<Pengaturan />} />} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
