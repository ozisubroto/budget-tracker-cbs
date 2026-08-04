import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Shell from '../komponen/Shell.jsx';
import { api, sesi, rp, tgl, NAMA_BULAN } from '../api.js';
import { usePanggil, Pil, Memuat, Kosong, Modal, Pesan } from '../komponen/dasar.jsx';

/** Antrean kerja Finance: yang harus dibayar dan yang belum lunas. */
export function Realisasi() {
  const nav = useNavigate();
  const a = usePanggil(() => api.get('/pengajuan?status=menunggu_realisasi'), []);
  const b = usePanggil(() => api.get('/pengajuan?status=realisasi_sebagian'), []);
  const [pilih, setPilih] = useState(null);
  const [f, setF] = useState({ tanggal: new Date().toISOString().slice(0, 10), nominal: '', metode: 'transfer', no_referensi: '' });
  const [tutupAlasan, setTutupAlasan] = useState('');
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  const bayar = usePanggil(() => (pilih ? api.get(`/pengajuan/${pilih.id}/pembayaran`) : Promise.resolve([])), [pilih?.id]);
  const sudah = (bayar.data ?? []).reduce((s, x) => s + Number(x.nominal), 0);
  const sisa = pilih ? Number(pilih.total_nominal) - sudah : 0;

  const jalankan = async (fn) => {
    setSibuk(true); setGalat(null);
    try { await fn(); setPilih(null); a.muatUlang(); b.muatUlang(); }
    catch (e) { setGalat(e.message); } finally { setSibuk(false); }
  };

  const Tabel = ({ judul, d, muat }) => (
    <section className="card">
      <div className="chead"><h3>{judul}</h3><div className="kanan"><span className="sub">{d?.length ?? 0} pengajuan</span></div></div>
      {muat ? <Memuat /> : !d?.length ? <Kosong teks="Tidak ada." /> : (
        <table><thead><tr><th>Nomor &amp; program</th><th>Kota</th><th>Kategori</th>
          <th className="ka">Disetujui</th><th /></tr></thead>
          <tbody>{d.map((x) => (
            <tr key={x.id}>
              <td className="klik" onClick={() => nav(`/pengajuan/${x.id}`)}>
                <div className="num">{x.nomor}</div><div className="sub">{x.judul}</div></td>
              <td>{x.kota}<div className="sub">{x.region}</div></td>
              <td>{x.kategori}<div className="sub">{NAMA_BULAN[x.periode_bulan]}</div></td>
              <td className="ka num">{rp(x.total_nominal)}</td>
              <td className="ka"><button className="btn primary kecil" onClick={() => { setPilih(x); setF({ ...f, nominal: '' }); }}>
                Catat pembayaran</button></td>
            </tr>
          ))}</tbody></table>
      )}
    </section>
  );

  return (
    <Shell judul="Realisasi" anak={
      <>
        <Tabel judul="Menunggu pembayaran pertama" d={a.data} muat={a.muat} />
        <Tabel judul="Belum lunas" d={b.data} muat={b.muat} />
        {pilih && (
          <Modal tutup={() => { setPilih(null); setGalat(null); }} judul={`Pembayaran ${pilih.nomor}`}
            catatan={`Disetujui ${rp(pilih.total_nominal)} · sudah dibayar ${rp(sudah)} · sisa ${rp(sisa)}`}
            anak={<>
              <Pesan anak={galat} />
              {(bayar.data ?? []).length > 0 && (
                <table style={{ marginBottom: 14 }}><tbody>{bayar.data.map((x) => (
                  <tr key={x.id}><td>{tgl(x.tanggal)}<div className="sub">{x.metode} {x.no_referensi ?? ''}</div></td>
                    <td className="ka num">{rp(x.nominal)}</td></tr>
                ))}</tbody></table>
              )}
              <div className="baris dua">
                <label className="f"><span>Tanggal bayar</span>
                  <input type="date" value={f.tanggal} onChange={(e) => setF({ ...f, tanggal: e.target.value })} /></label>
                <label className="f"><span>Nominal</span>
                  <input type="number" value={f.nominal} onChange={(e) => setF({ ...f, nominal: e.target.value })}
                    placeholder={String(Math.round(sisa))} /></label>
              </div>
              <div className="baris dua">
                <label className="f"><span>Metode</span>
                  <select value={f.metode} onChange={(e) => setF({ ...f, metode: e.target.value })}>
                    <option value="transfer">Transfer</option><option value="tunai">Tunai</option></select></label>
                <label className="f"><span>Nomor referensi</span>
                  <input value={f.no_referensi} onChange={(e) => setF({ ...f, no_referensi: e.target.value })} /></label>
              </div>
              <div className="rule" style={{ margin: '6px 0 14px' }} />
              <label className="f"><span>Atau tutup pengajuan di bawah nominal (khusus vendor)</span>
                <input value={tutupAlasan} onChange={(e) => setTutupAlasan(e.target.value)}
                  placeholder="Alasan, mis. invoice vendor lebih rendah dari penawaran" /></label>
              <p className="sub">Penutupan melepas selisihnya kembali ke pagu. Untuk reimburse dan kas, dibayar penuh dan
                sisanya kembali lewat setoran di LPJ.</p>
            </>}
            aksi={<>
              <button className="btn ghost" disabled={sibuk || !tutupAlasan}
                onClick={() => jalankan(() => api.post(`/pengajuan/${pilih.id}/tutup`, { alasan: tutupAlasan }))}>Tutup pengajuan</button>
              <button className="btn primary" disabled={sibuk || !(Number(f.nominal) > 0)}
                onClick={() => jalankan(() => api.post(`/pengajuan/${pilih.id}/bayar`, f))}>
                {sibuk ? 'Menyimpan…' : 'Catat pembayaran'}</button>
            </>} />
        )}
      </>
    } />
  );
}

export function Lpj() {
  const p = sesi.pengguna;
  const nav = useNavigate();
  const [tab, setTab] = useState('menunggak');
  const daftar = usePanggil(() => api.get(tab === 'menunggak' ? '/lpj?menunggak=1' : '/lpj'), [tab]);
  const [pilih, setPilih] = useState(null);
  const [item, setItem] = useState([]);
  const [bukti, setBukti] = useState('');
  const [catatan, setCatatan] = useState('');
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  const buka = async (x) => {
    setGalat(null);
    const d = await api.get(`/pengajuan/${x.id}`);
    // Kolom realisasi terisi otomatis dengan angka rencana. Admin hanya mengubah
    // baris yang berbeda - kalau harus mengetik ulang, LPJ akan ditunda.
    setItem((d.item ?? []).map((i) => ({ pengajuan_item_id: i.id, nama: i.nama, qty_rencana: i.qty,
      harga_rencana: i.harga_satuan, qty_aktual: i.qty, harga_aktual: i.harga_satuan })));
    setPilih({ ...x, jenis_penerima: d.jenis_penerima, status: d.status, status_lpj: d.status_lpj });
  };

  const totalAktual = item.reduce((s, x) => s + (Number(x.qty_aktual) || 0) * (Number(x.harga_aktual) || 0), 0);

  const jalankan = async (fn) => {
    setSibuk(true); setGalat(null);
    try { await fn(); setPilih(null); daftar.muatUlang(); }
    catch (e) { setGalat(e.message); } finally { setSibuk(false); }
  };

  return (
    <Shell judul="LPJ" anak={
      <>
        <div className="tab">
          <button className={tab === 'menunggak' ? 'on' : ''} onClick={() => setTab('menunggak')}>Menunggak</button>
          <button className={tab === 'semua' ? 'on' : ''} onClick={() => setTab('semua')}>Semua</button>
        </div>
        <section className="card">
          <div className="chead"><h3>{daftar.data?.length ?? 0} pengajuan</h3></div>
          {daftar.muat ? <Memuat /> : !daftar.data?.length ? <Kosong teks="Tidak ada LPJ pada saringan ini." /> : (
            <table><thead><tr><th>Nomor &amp; program</th><th>Kota</th><th className="ka">Nominal</th>
              <th>Batas LPJ</th><th>Status LPJ</th><th /></tr></thead>
              <tbody>{daftar.data.map((x) => (
                <tr key={x.id}>
                  <td className="klik" onClick={() => nav(`/pengajuan/${x.id}`)}>
                    <div className="num">{x.nomor}</div><div className="sub">{x.judul}</div></td>
                  <td>{x.kota}<div className="sub">{x.region}</div></td>
                  <td className="ka num">{rp(x.total_nominal)}</td>
                  <td>{tgl(x.batas_lpj)}{Number(x.telat_hari) > 0 &&
                    <div><span className="chip bad">Telat {x.telat_hari} hari</span></div>}</td>
                  <td><span className={`chip ${x.status_lpj === 'disetujui' ? 'ok' : x.status_lpj === 'menunggu_verifikasi' ? 'info' : 'warn'}`}>
                    {x.status_lpj.replace(/_/g, ' ')}</span></td>
                  <td className="ka">
                    {p.peran === 'admin' && x.status_lpj !== 'disetujui' && x.status_lpj !== 'menunggu_verifikasi' &&
                      <button className="btn primary kecil" onClick={() => buka(x)}>Isi LPJ</button>}
                    {p.peran === 'finance' && x.status_lpj === 'menunggu_verifikasi' &&
                      <button className="btn primary kecil" onClick={() => buka(x)}>Verifikasi</button>}
                  </td>
                </tr>
              ))}</tbody></table>
          )}
        </section>

        {pilih && (
          <Modal tutup={() => { setPilih(null); setGalat(null); }} judul={`LPJ ${pilih.nomor}`}
            catatan={pilih.jenis_penerima === 'vendor'
              ? 'Penerima vendor: sisa selalu nol karena uang keluar sesuai invoice. Yang dipertanggungjawabkan adalah pelaksanaan programnya.'
              : 'Sisa dana wajib disetorkan kembali dan buktinya dilampirkan.'}
            anak={<>
              <Pesan anak={galat} />
              {p.peran === 'admin' ? (
                <>
                  <table><thead><tr><th>Item</th><th className="ka">Rencana</th><th className="ka">Qty aktual</th>
                    <th className="ka">Harga aktual</th></tr></thead>
                    <tbody>{item.map((x, i) => (
                      <tr key={i}>
                        <td>{x.nama}</td>
                        <td className="ka num">{rp(Number(x.qty_rencana) * Number(x.harga_rencana))}</td>
                        <td><input type="number" className="ka" style={{ width: 70 }} value={x.qty_aktual}
                          onChange={(e) => setItem(item.map((y, k) => k === i ? { ...y, qty_aktual: e.target.value } : y))} /></td>
                        <td><input type="number" className="ka" value={x.harga_aktual}
                          onChange={(e) => setItem(item.map((y, k) => k === i ? { ...y, harga_aktual: e.target.value } : y))} /></td>
                      </tr>
                    ))}</tbody></table>
                  <div className="split"><div><div className="k">Total terpakai</div>
                    <div className="v">{rp(totalAktual)}</div></div>
                    <div><div className="k">Sisa dari yang dibayar</div>
                      <div className="v">{rp(Math.max(0, Number(pilih.total_nominal) - totalAktual))}</div></div></div>
                  {pilih.jenis_penerima !== 'vendor' && (
                    <label className="f" style={{ marginTop: 14 }}><span>Bukti setor sisa dana</span>
                      <input value={bukti} onChange={(e) => setBukti(e.target.value)} placeholder="nomor bukti setor" /></label>
                  )}
                  <label className="f"><span>Catatan pelaksanaan</span>
                    <textarea rows="2" value={catatan} onChange={(e) => setCatatan(e.target.value)} /></label>
                </>
              ) : (
                <p className="sub">Periksa rincian realisasi pada halaman pengajuan. LPJ hanya dapat disetujui atau
                  dikembalikan untuk diperbaiki — tidak ada penolakan, karena uangnya sudah keluar.</p>
              )}
            </>}
            aksi={p.peran === 'admin' ? (
              <>
                <button className="btn ghost" onClick={() => setPilih(null)}>Batal</button>
                <button className="btn primary" disabled={sibuk}
                  onClick={() => jalankan(() => api.post(`/lpj/${pilih.id}`, {
                    item: item.map(({ pengajuan_item_id, qty_aktual, harga_aktual }) => ({ pengajuan_item_id, qty_aktual, harga_aktual })),
                    bukti_setor: bukti || undefined, catatan,
                  }))}>{sibuk ? 'Mengirim…' : 'Kirim LPJ'}</button>
              </>
            ) : (
              <>
                <button className="btn ghost" disabled={sibuk || !catatan}
                  onClick={() => jalankan(() => api.post(`/lpj/${pilih.id}/verifikasi`, { aksi: 'revisi', alasan: catatan }))}>
                  Minta revisi</button>
                <button className="btn setuju" disabled={sibuk}
                  onClick={() => jalankan(() => api.post(`/lpj/${pilih.id}/verifikasi`, { aksi: 'approve' }))}>Setujui</button>
              </>
            )} />
        )}
      </>
    } />
  );
}
