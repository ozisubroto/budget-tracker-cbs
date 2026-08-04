import { useState } from 'react';
import Shell from '../komponen/Shell.jsx';
import { api, sesi } from '../api.js';
import { usePanggil, Memuat, Kosong, Modal, Pesan } from '../komponen/dasar.jsx';

const JENIS = [
  ['vendor', 'Vendor', 'Dibayar sesuai invoice. Sisa di bawah nominal ditutup Finance dan dilepas ke pagu.'],
  ['reimburse_sales', 'Reimburse sales', 'Dibayar penuh. Sisa dana kembali lewat setoran yang dilaporkan di LPJ.'],
  ['kas', 'Kas', 'Dibayar penuh dari kas. Sisa dana kembali lewat setoran di LPJ.'],
];

/**
 * Master penerima, dikelola Finance.
 *
 * Yang membayar adalah yang paling berkepentingan memastikan rekeningnya benar.
 * Memisahkan pengelolaan ke peran lain hanya memperlambat tanpa menambah
 * keamanan.
 *
 * Inilah yang membuat rekening tidak pernah diketik di form pengajuan - titik
 * rawan penyalahgunaan yang paling umum, karena satu digit diubah dan approval
 * tetap terlihat sah oleh orang yang memeriksa nominal, bukan rekening.
 */
export default function Penerima() {
  const p = sesi.pengguna;
  const bisaUbah = p.peran === 'finance';
  const { data, muat, muatUlang } = usePanggil(() => api.get('/master/penerima'), []);
  const [buka, setBuka] = useState(false);
  const [f, setF] = useState({ jenis: 'vendor', nama: '', bank: '', no_rekening: '' });
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  const simpan = async () => {
    setSibuk(true); setGalat(null);
    try {
      await api.post('/master/penerima', f);
      setBuka(false); setF({ jenis: 'vendor', nama: '', bank: '', no_rekening: '' }); muatUlang();
    } catch (e) { setGalat(e.message); } finally { setSibuk(false); }
  };

  const nonaktifkan = async (x) => {
    if (!confirm(`Nonaktifkan ${x.nama}? Pengajuan lama yang memakainya tidak terpengaruh.`)) return;
    await api.patch(`/master/penerima/${x.id}`, { aktif: false });
    muatUlang();
  };

  const kelompok = JENIS.map(([kode, label, catatan]) => ({
    kode, label, catatan, isi: (data ?? []).filter((x) => x.jenis === kode),
  }));

  return (
    <Shell judul="Master Penerima"
      aksi={bisaUbah && <button className="btn primary" onClick={() => setBuka(true)}>Tambah penerima</button>}
      anak={
        <>
          <section className="card">
            <p className="sub">Rekening tidak pernah diketik di form pengajuan — Admin hanya memilih dari daftar ini.
              Itu menutup titik rawan yang paling umum: satu digit rekening diubah, dan approval tetap terlihat sah
              karena semua orang memeriksa nominal, bukan rekening.
              {!bisaUbah && ' Hanya Finance yang dapat menambah atau mengubah daftar ini.'}</p>
          </section>

          {muat ? <section className="card"><Memuat /></section> : kelompok.map((k) => (
            <section className="card" key={k.kode}>
              <div className="chead"><h3>{k.label}</h3>
                <div className="kanan"><span className="sub">{k.isi.length} penerima</span></div></div>
              <p className="sub" style={{ marginBottom: 14 }}>{k.catatan}</p>
              {!k.isi.length ? <Kosong teks={`Belum ada penerima ${k.label.toLowerCase()}.`} /> : (
                <table><thead><tr><th>Nama</th><th>Bank</th><th>Nomor rekening</th><th /></tr></thead>
                  <tbody>{k.isi.map((x) => (
                    <tr key={x.id}>
                      <td style={{ fontWeight: 600 }}>{x.nama}</td>
                      <td>{x.bank ?? <span className="sub">—</span>}</td>
                      <td className="num">{x.no_rekening ?? <span className="sub">tunai</span>}</td>
                      <td className="ka">{bisaUbah &&
                        <button className="btn ghost kecil" onClick={() => nonaktifkan(x)}>Nonaktifkan</button>}</td>
                    </tr>
                  ))}</tbody></table>
              )}
            </section>
          ))}

          {buka && (
            <Modal tutup={() => { setBuka(false); setGalat(null); }} judul="Tambah penerima"
              catatan="Periksa nomor rekening dua kali sebelum menyimpan. Setelah dipakai pengajuan, kesalahan di sini menyebar ke setiap pembayaran berikutnya."
              anak={<>
                <Pesan anak={galat} />
                <label className="f"><span>Jenis penerima</span>
                  <select value={f.jenis} onChange={(e) => setF({ ...f, jenis: e.target.value })}>
                    {JENIS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select></label>
                <p className="sub" style={{ marginTop: -6, marginBottom: 14 }}>
                  {JENIS.find(([k]) => k === f.jenis)[2]}</p>
                <label className="f"><span>Nama penerima</span>
                  <input value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} autoFocus
                    placeholder={f.jenis === 'vendor' ? 'PT Kreasi Media Nusantara' : f.jenis === 'kas' ? 'Kas Operasional Pusat' : 'Budi Santoso'} /></label>
                {f.jenis !== 'kas' && (
                  <div className="baris dua">
                    <label className="f"><span>Bank</span>
                      <input value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} placeholder="BCA" /></label>
                    <label className="f"><span>Nomor rekening</span>
                      <input value={f.no_rekening} onChange={(e) => setF({ ...f, no_rekening: e.target.value })} /></label>
                  </div>
                )}
              </>}
              aksi={<>
                <button className="btn ghost" onClick={() => setBuka(false)}>Batal</button>
                <button className="btn primary" onClick={simpan}
                  disabled={sibuk || !f.nama || (f.jenis !== 'kas' && (!f.bank || !f.no_rekening))}>
                  {sibuk ? 'Menyimpan…' : 'Simpan'}</button>
              </>} />
          )}
        </>
      } />
  );
}
