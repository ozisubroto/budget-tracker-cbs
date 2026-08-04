import { useEffect, useState } from 'react';
import { STATUS, rp } from '../api.js';

export const Pil = ({ status }) => {
  const s = STATUS[status] ?? { teks: status, warna: 'var(--faint)' };
  return <span className="stat"><i className="sd" style={{ background: s.warna }} />{s.teks}</span>;
};

export const Umur = ({ hari, batas = 4 }) => (
  <span className={`age${Number(hari) >= batas ? ' hot' : ''}`}>{Number(hari) || 0} hari</span>
);

export const Pesan = ({ jenis = 'galat', anak }) => (anak ? <div className={`pesan ${jenis}`}>{anak}</div> : null);

export function Modal({ judul, catatan, anak, aksi, tutup }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && tutup();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [tutup]);
  return (
    <div className="tirai" onClick={(e) => e.target === e.currentTarget && tutup()}>
      <div className="modal">
        <h3>{judul}</h3>
        {catatan && <p className="sub" style={{ marginBottom: 16 }}>{catatan}</p>}
        {anak}
        <div className="aksi">{aksi}</div>
      </div>
    </div>
  );
}

export function Kosong({ teks }) { return <div className="kosong">{teks}</div>; }

export function Memuat() { return <div className="kosong">Memuat…</div>; }

/** Hook pengambilan data sederhana dengan status muat dan galat. */
export function usePanggil(fn, deps = []) {
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState(null);
  const [muat, setMuat] = useState(true);
  const [tik, setTik] = useState(0);
  useEffect(() => {
    let hidup = true;
    setMuat(true); setGalat(null);
    fn().then((d) => hidup && setData(d)).catch((e) => hidup && setGalat(e.message)).finally(() => hidup && setMuat(false));
    return () => { hidup = false; };
  }, [...deps, tik]);
  return { data, galat, muat, muatUlang: () => setTik((t) => t + 1) };
}

export const Uang = ({ n }) => <span className="num">{rp(n)}</span>;
