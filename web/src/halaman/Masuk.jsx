import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, sesi } from '../api.js';
import { Pesan } from '../komponen/dasar.jsx';

export default function Masuk() {
  const [email, setEmail] = useState('');
  const [sandi, setSandi] = useState('');
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const nav = useNavigate();

  const kirim = async (e) => {
    e.preventDefault();
    setSibuk(true); setGalat(null);
    try {
      const d = await api.post('/auth/masuk', { email, sandi });
      sesi.simpan(d.token, d.pengguna);
      const tujuan = sessionStorage.getItem('bt_tujuan');
      sessionStorage.removeItem('bt_tujuan');
      nav(tujuan || '/');
    } catch (x) { setGalat(x.message); } finally { setSibuk(false); }
  };

  return (
    <div className="masuk">
      <form className="card" onSubmit={kirim}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div className="mark">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <path d="M3 17l6-6 4 4 7-8" /><path d="M14 7h6v6" />
            </svg>
          </div>
          <div><b style={{ fontFamily: 'Inter Tight', fontSize: 15 }}>Budget Tracker</b>
            <span className="sub" style={{ display: 'block' }}>CBS Group</span></div>
        </div>
        <Pesan anak={galat} />
        <label className="f"><span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required
            placeholder="nama@cbsgroup.co.id" /></label>
        <label className="f"><span>Kata sandi</span>
          <input type="password" value={sandi} onChange={(e) => setSandi(e.target.value)} required /></label>
        <button className="btn primary" style={{ width: '100%' }} disabled={sibuk}>
          {sibuk ? 'Memeriksa…' : 'Masuk'}
        </button>
        <p className="sub" style={{ marginTop: 14, textAlign: 'center' }}>
          Lupa sandi? Hubungi Super Admin untuk penyetelan ulang.
        </p>
      </form>
    </div>
  );
}
