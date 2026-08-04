import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { sesi, api, PERAN } from '../api.js';

const I = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const ikon = {
  dashboard: ['M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z'],
  pengajuan: ['M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z', 'M14 3v5h5M9 13h6M9 17h4'],
  setuju: ['M9 11l3 3 7-7', 'M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9'],
  bayar: ['M3 6h18v13H3z', 'M3 10h18M7 15h4'],
  lpj: ['M8 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2h-2', 'M8 2h8v4H8zM9 12l2 2 4-4'],
  plan: ['M4 20V10M10 20V4M16 20v-7M22 20H2'],
  pagu: ['M21 12a9 9 0 11-6.2-8.6', 'M21 4v6h-6'],
  laporan: ['M3 3v16a2 2 0 002 2h16', 'M7 14l4-4 3 3 5-6'],
  delegasi: ['M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2', 'M9 3a4 4 0 100 8 4 4 0 000-8M22 21v-2a4 4 0 00-3-3.9'],
  atur: ['M12 9a3 3 0 100 6 3 3 0 000-6', 'M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 007 19.4a1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15a2 2 0 010-4 1.7 1.7 0 001.6-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 019 4.6 2 2 0 0111 3a2 2 0 014 0 1.7 1.7 0 001.1 1.6 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V11a2 2 0 010 4z'],
};

// Menu disusun per peran. Orang hanya melihat yang memang bisa dia kerjakan -
// menu yang selalu menolak saat diklik lebih membingungkan daripada tidak ada.
const MENU = [
  { ke: '/', label: 'Dashboard', ikon: 'dashboard', peran: '*' },
  { ke: '/pengajuan', label: 'Pengajuan', ikon: 'pengajuan', peran: ['admin', 'atasan_1', 'atasan_2', 'atasan_3', 'finance'] },
  { ke: '/persetujuan', label: 'Persetujuan', ikon: 'setuju', peran: ['atasan_1', 'atasan_2', 'atasan_3', 'finance'] },
  { ke: '/realisasi', label: 'Realisasi', ikon: 'bayar', peran: ['finance'] },
  { ke: '/lpj', label: 'LPJ', ikon: 'lpj', peran: ['admin', 'finance', 'atasan_3'] },
  { judul: 'Anggaran' },
  { ke: '/master-plan', label: 'Master Plan', ikon: 'plan', peran: ['super_admin', 'atasan_3'] },
  { ke: '/pagu', label: 'Serapan Pagu', ikon: 'pagu', peran: '*' },
  { ke: '/laporan', label: 'Laporan', ikon: 'laporan', peran: '*' },
  { bawah: true },
  { ke: '/delegasi', label: 'Delegasi', ikon: 'delegasi', peran: '*' },
  { ke: '/pengaturan', label: 'Pengaturan', ikon: 'atur', peran: ['super_admin', 'atasan_3'] },
];

export default function Shell({ judul, aksi, anak }) {
  const [lipat, setLipat] = useState(localStorage.getItem('bt_lipat') === '1');
  const [belum, setBelum] = useState(0);
  const nav = useNavigate();
  const lok = useLocation();
  const p = sesi.pengguna;

  useEffect(() => { localStorage.setItem('bt_lipat', lipat ? '1' : '0'); }, [lipat]);
  useEffect(() => {
    const ambil = () => api.get('/notifikasi?belum=1').then((d) => setBelum(d.belum_dibaca)).catch(() => {});
    ambil();
    const t = setInterval(ambil, 60_000);
    return () => clearInterval(t);
  }, [lok.pathname]);

  const boleh = (m) => m.peran === '*' || m.peran.includes(p.peran);
  const inisial = (p.nama || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={`shell${lipat ? ' collapsed' : ''}`}>
      <aside className="side">
        <div className="brand">
          <div className="mark">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <path d="M3 17l6-6 4 4 7-8" /><path d="M14 7h6v6" />
            </svg>
          </div>
          <div><b>Budget Tracker</b><span>CBS Group</span></div>
          <button className="collapse" onClick={() => setLipat(true)} title="Sembunyikan menu">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M10 4v16" />
            </svg>
          </button>
        </div>
        <nav className="nav">
          {MENU.map((m, i) =>
            m.judul ? <div key={i}><div className="rule" /><div className="eyebrow">{m.judul}</div></div>
            : m.bawah ? <div key={i} className="foot"><div className="rule" style={{ marginBottom: 8 }} /></div>
            : boleh(m) ? (
              <NavLink key={i} to={m.ke} end={m.ke === '/'} className={({ isActive }) => (isActive ? 'on' : '')} title={m.label}>
                <I d={ikon[m.ikon]} /><span>{m.label}</span>
              </NavLink>
            ) : null,
          )}
        </nav>
      </aside>

      <main className="main">
        <div className="top">
          <button className="expand" onClick={() => setLipat(false)} title="Tampilkan menu">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M10 4v16" />
            </svg>
          </button>
          <h1>{judul}</h1>
          {aksi}
          <button className="icon-btn" onClick={() => nav('/notifikasi')} title="Notifikasi">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" />
            </svg>
            {belum > 0 && <i className="dot-alert">{belum > 9 ? '9+' : belum}</i>}
          </button>
          <button className="avatar" title={`${p.nama} — ${PERAN[p.peran]}`}
            onClick={() => { if (confirm('Keluar dari aplikasi?')) { sesi.hapus(); nav('/masuk'); } }}>
            {inisial}
          </button>
        </div>
        {anak}
      </main>
    </div>
  );
}
