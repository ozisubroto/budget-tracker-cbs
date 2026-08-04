import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import Shell from '../komponen/Shell.jsx';
import { api, sesi, rp, persen, tgl, NAMA_BULAN, STATUS } from '../api.js';
import { usePanggil, Pil, Umur, Memuat, Kosong, Modal, Pesan } from '../komponen/dasar.jsx';

export function DaftarPengajuan() {
  const nav = useNavigate();
  const [saring, setSaring] = useState('');
  const { data, muat } = usePanggil(() => api.get(`/pengajuan${saring ? `?status=${saring}` : ''}`), [saring]);
  const p = sesi.pengguna;

  return (
    <Shell judul="Pengajuan"
      aksi={p.peran === 'admin' && (
        <button className="btn primary" onClick={() => nav('/pengajuan/baru')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Pengajuan Baru
        </button>
      )}
      anak={
        <section className="card">
          <div className="chead">
            <h3>{data?.length ?? 0} pengajuan</h3>
            <div className="kanan">
              <select value={saring} onChange={(e) => setSaring(e.target.value)} style={{ width: 200 }}>
                <option value="">Semua status</option>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.teks}</option>)}
              </select>
            </div>
          </div>
          {muat ? <Memuat /> : !data?.length ? <Kosong teks="Tidak ada pengajuan dengan saringan ini." /> : (
            <table><thead><tr><th>Nomor &amp; program</th><th>Kota</th><th>Kategori</th><th>Periode</th>
              <th className="ka">Nominal</th><th>Status</th><th className="ka">Umur</th></tr></thead>
              <tbody>{data.map((x) => (
                <tr key={x.id} className="klik" onClick={() => nav(`/pengajuan/${x.id}`)}>
                  <td><div className="num">{x.nomor.startsWith('DRAFT') ? 'Draft' : x.nomor}
                    {x.versi_no > 1 && <span className="sub"> · v{x.versi_no}</span>}</div>
                    <div className="sub">{x.judul}</div>
                    {x.melebihi_pagu && <span className="chip bad" style={{ marginTop: 4 }}>Melebihi pagu</span>}
                    {x.jalur_cepat && <span className="chip info" style={{ marginTop: 4 }}>Jalur cepat</span>}</td>
                  <td>{x.kota}<div className="sub">{x.region}</div></td>
                  <td>{x.kategori}</td>
                  <td>{NAMA_BULAN[x.periode_bulan]} {x.periode_tahun}</td>
                  <td className="ka num">{rp(x.total_nominal)}</td>
                  <td><Pil status={x.status} /></td>
                  <td className="ka"><Umur hari={x.umur_hari} /></td>
                </tr>
              ))}</tbody></table>
          )}
        </section>
      } />
  );
}

const kosongItem = () => ({ nama: '', qty: 1, satuan: 'paket', harga_satuan: '' });

export function PengajuanBaru() {
  const nav = useNavigate();
  const [f, setF] = useState({ kota_id: '', kategori_id: '', periode_tahun: new Date().getFullYear(),
    periode_bulan: new Date().getMonth() + 1, judul: '', tujuan: '', tgl_mulai: '', tgl_selesai: '', lokasi: '', penerima_id: '' });
  const [item, setItem] = useState([kosongItem()]);
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const wilayah = usePanggil(() => api.get('/master/wilayah'), []);
  const kategori = usePanggil(() => api.get('/master/kategori'), []);
  const penerima = usePanggil(() => api.get('/master/penerima'), []);

  const total = item.reduce((s, x) => s + (Number(x.qty) || 0) * (Number(x.harga_satuan) || 0), 0);
  const kota = (wilayah.data ?? []).find((w) => String(w.kota_id) === String(f.kota_id));

  const simpan = async () => {
    setSibuk(true); setGalat(null);
    try {
      const p = await api.post('/pengajuan', f);
      await api.put(`/pengajuan/${p.id}/item`, { item });
      nav(`/pengajuan/${p.id}`);
    } catch (e) { setGalat(e.message); } finally { setSibuk(false); }
  };

  return (
    <Shell judul="Pengajuan baru" anak={
      <div className="grid" style={{ gridTemplateColumns: '1fr 336px', alignItems: 'start' }}>
        <div className="grid">
          <section className="card">
            <div className="chead"><h3>Sumber anggaran</h3></div>
            <Pesan anak={galat} />
            <div className="baris dua">
              <label className="f"><span>Kota</span>
                <select value={f.kota_id} onChange={(e) => setF({ ...f, kota_id: e.target.value })}>
                  <option value="">Pilih kota…</option>
                  {(wilayah.data ?? []).map((w) => <option key={w.kota_id} value={w.kota_id}>{w.kota} — {w.region}</option>)}
                </select></label>
              <label className="f"><span>Kategori budget</span>
                <select value={f.kategori_id} onChange={(e) => setF({ ...f, kategori_id: e.target.value })}>
                  <option value="">Pilih kategori…</option>
                  {(kategori.data ?? []).map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
                </select></label>
            </div>
            {kota && <p className="sub" style={{ marginTop: -4, marginBottom: 12 }}>
              Area <b>{kota.area}</b> · Region <b>{kota.region}</b> — terisi otomatis dan terkunci.</p>}
            <div className="baris dua">
              <label className="f"><span>Bulan anggaran</span>
                <select value={f.periode_bulan} onChange={(e) => setF({ ...f, periode_bulan: Number(e.target.value) })}>
                  {NAMA_BULAN.slice(1).map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
                </select></label>
              <label className="f"><span>Tahun anggaran</span>
                <input type="number" value={f.periode_tahun} onChange={(e) => setF({ ...f, periode_tahun: Number(e.target.value) })} /></label>
            </div>
          </section>

          <section className="card">
            <div className="chead"><h3>Detail program</h3></div>
            <label className="f"><span>Judul program</span>
              <input value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} placeholder="Bazaar Kojie-san Bandung Indah" /></label>
            <label className="f"><span>Tujuan</span>
              <textarea rows="2" value={f.tujuan} onChange={(e) => setF({ ...f, tujuan: e.target.value })} /></label>
            <div className="baris tiga">
              <label className="f"><span>Tanggal mulai</span>
                <input type="date" value={f.tgl_mulai} onChange={(e) => setF({ ...f, tgl_mulai: e.target.value })} /></label>
              <label className="f"><span>Tanggal selesai</span>
                <input type="date" value={f.tgl_selesai} onChange={(e) => setF({ ...f, tgl_selesai: e.target.value })} /></label>
              <label className="f"><span>Lokasi</span>
                <input value={f.lokasi} onChange={(e) => setF({ ...f, lokasi: e.target.value })} /></label>
            </div>
          </section>

          <section className="card">
            <div className="chead"><h3>Rincian item</h3>
              <div className="kanan"><button className="btn ghost kecil" onClick={() => setItem([...item, kosongItem()])}>Tambah baris</button></div></div>
            <table><thead><tr><th style={{ width: '40%' }}>Nama item</th><th>Qty</th><th>Satuan</th>
              <th className="ka">Harga satuan</th><th className="ka">Subtotal</th><th /></tr></thead>
              <tbody>{item.map((x, i) => (
                <tr key={i}>
                  <td><input value={x.nama} onChange={(e) => setItem(item.map((y, k) => k === i ? { ...y, nama: e.target.value } : y))} /></td>
                  <td><input type="number" min="0" step="0.01" value={x.qty} style={{ width: 70 }}
                    onChange={(e) => setItem(item.map((y, k) => k === i ? { ...y, qty: e.target.value } : y))} /></td>
                  <td><input value={x.satuan} style={{ width: 80 }}
                    onChange={(e) => setItem(item.map((y, k) => k === i ? { ...y, satuan: e.target.value } : y))} /></td>
                  <td><input type="number" min="0" value={x.harga_satuan} className="ka"
                    onChange={(e) => setItem(item.map((y, k) => k === i ? { ...y, harga_satuan: e.target.value } : y))} /></td>
                  <td className="ka num">{rp((Number(x.qty) || 0) * (Number(x.harga_satuan) || 0))}</td>
                  <td className="ka">{item.length > 1 && (
                    <button className="btn ghost kecil" onClick={() => setItem(item.filter((_, k) => k !== i))}>Hapus</button>)}</td>
                </tr>
              ))}</tbody></table>
            <div className="split"><div><div className="k">Total nominal — dihitung sistem, tidak diketik</div>
              <div className="v" style={{ fontSize: 20 }}>{rp(total)}</div></div></div>
          </section>
        </div>

        <div className="grid">
          <section className="card">
            <div className="chead"><h3>Pembayaran</h3></div>
            <label className="f"><span>Penerima</span>
              <select value={f.penerima_id} onChange={(e) => setF({ ...f, penerima_id: e.target.value })}>
                <option value="">Pilih penerima…</option>
                {(penerima.data ?? []).map((x) => (
                  <option key={x.id} value={x.id}>{x.nama} — {x.jenis.replace('_', ' ')}</option>
                ))}
              </select></label>
            <p className="sub">Rekening tidak diketik di sini. Daftar penerima dikelola Finance — kalau penerimanya belum ada,
              mintakan penambahan lebih dulu.</p>
            <label className="f" style={{ marginTop: 12 }}><span>Tanggal dibutuhkan</span>
              <input type="date" value={f.tgl_dibutuhkan ?? ''} onChange={(e) => setF({ ...f, tgl_dibutuhkan: e.target.value })} /></label>
          </section>

          <section className="card">
            <p className="sub">Pengajuan disimpan sebagai draft lebih dulu. Setelah itu Anda bisa memeriksa sisa pagu dan
              cost ratio sebelum benar-benar mengirimnya.</p>
            <div className="aksi">
              <Link className="btn ghost" to="/pengajuan">Batal</Link>
              <button className="btn primary" onClick={simpan}
                disabled={sibuk || !f.kota_id || !f.kategori_id || !f.judul || !f.tgl_mulai || !f.tgl_selesai || total <= 0}>
                {sibuk ? 'Menyimpan…' : 'Simpan draft'}
              </button>
            </div>
          </section>
        </div>
      </div>
    } />
  );
}
