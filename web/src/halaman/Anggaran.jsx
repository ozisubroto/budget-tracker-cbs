import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Shell from '../komponen/Shell.jsx';
import { api, sesi, rp, rpSingkat, persen, tgl, NAMA_BULAN, unduhBerkas } from '../api.js';
import { usePanggil, Memuat, Kosong, Modal, Pesan, Pil } from '../komponen/dasar.jsx';

const TAHUN = new Date().getFullYear();

export function Pagu() {
  const nav = useNavigate();
  const [bulan, setBulan] = useState('');
  const [tingkat, setTingkat] = useState('region');
  const { data, muat } = usePanggil(
    () => api.get(`/laporan/serapan${tingkat === 'area' ? '/area' : tingkat === 'kota' ? '/kota' : ''}?tahun=${TAHUN}${bulan ? `&bulan=${bulan}` : ''}`),
    [bulan, tingkat],
  );
  const [sel, setSel] = useState(null);
  const rincian = usePanggil(
    () => (sel ? api.get(`/laporan/serapan/pengajuan?tahun=${TAHUN}&bulan=${sel.bulan}&region_id=${sel.region_id}&kategori_id=${sel.kategori_id}`) : Promise.resolve([])),
    [sel?.region_id, sel?.kategori_id, sel?.bulan],
  );

  return (
    <Shell judul="Serapan pagu" anak={
      <section className="card">
        <div className="chead">
          <div className="tab">
            {['region', 'area', 'kota'].map((t) => (
              <button key={t} className={tingkat === t ? 'on' : ''} onClick={() => setTingkat(t)}>
                {t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
          <div className="kanan">
            <select value={bulan} onChange={(e) => setBulan(e.target.value)} style={{ width: 160 }}>
              <option value="">Semua bulan</option>
              {NAMA_BULAN.slice(1).map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
            </select>
            <button className="btn ghost kecil"
              onClick={() => unduhBerkas(`/laporan/serapan/excel?tahun=${TAHUN}`, `serapan-${TAHUN}.xlsx`)}>
              Ekspor Excel</button>
          </div>
        </div>
        {muat ? <Memuat /> : !data?.length ? <Kosong teks="Belum ada data." /> : (
          <table>
            <thead><tr>
              <th>{tingkat === 'region' ? 'Region' : tingkat === 'area' ? 'Area' : 'Kota'}</th>
              <th>Kategori</th><th>Bulan</th>
              <th className="ka">{tingkat === 'kota' ? 'Diajukan' : tingkat === 'area' ? 'Alokasi' : 'Plafon'}</th>
              <th className="ka">Terkunci</th><th className="ka">Terpakai</th>
              <th className="ka">{tingkat === 'kota' ? 'Cost ratio' : 'Tersedia'}</th>
            </tr></thead>
            <tbody>{data.slice(0, 400).map((x, i) => (
              <tr key={i} className={tingkat === 'region' ? 'klik' : ''}
                onClick={() => tingkat === 'region' && setSel(x)}>
                <td style={{ fontWeight: 600 }}>{x.region ?? x.area ?? x.kota}
                  {tingkat !== 'region' && <div className="sub">{x.region}</div>}</td>
                <td>{x.kategori}</td>
                <td>{NAMA_BULAN[x.bulan]}</td>
                <td className="ka num">{rpSingkat(x.plafon ?? x.alokasi ?? x.diajukan)}</td>
                <td className="ka num">{rpSingkat(x.terkunci)}</td>
                <td className="ka num">{rpSingkat(x.terpakai)}</td>
                <td className="ka">
                  {tingkat === 'kota' ? (x.cost_ratio_persen == null ? '—' :
                    <span className={`chip ${x.cost_ratio_persen > 12 ? 'bad' : 'ok'}`}>{persen(x.cost_ratio_persen)}</span>)
                  : <span className="num" style={{ color: Number(x.tersedia) < 0 ? 'var(--red)' : undefined }}>
                      {rpSingkat(x.tersedia)}</span>}
                  {Number(x.pinjam_region) > 0 && <div className="sub">pinjam {rpSingkat(x.pinjam_region)}</div>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {sel && (
          <Modal tutup={() => setSel(null)} judul={`${sel.region} · ${sel.kategori} · ${NAMA_BULAN[sel.bulan]}`}
            catatan={`Plafon ${rp(sel.plafon)} — setiap angka dapat ditelusuri sampai pengajuan pembentuknya.`}
            anak={rincian.muat ? <Memuat /> : !rincian.data?.length ? <Kosong teks="Belum ada pengajuan pada kombinasi ini." /> : (
              <table><thead><tr><th>Nomor</th><th>Kota</th><th className="ka">Terkunci</th><th className="ka">Terpakai</th></tr></thead>
                <tbody>{rincian.data.map((x) => (
                  <tr key={x.id} className="klik" onClick={() => nav(`/pengajuan/${x.id}`)}>
                    <td><div className="num">{x.nomor}</div><div className="sub">{x.judul}</div></td>
                    <td>{x.kota}<div className="sub">{x.area}</div></td>
                    <td className="ka num">{rp(x.terkunci)}</td><td className="ka num">{rp(x.terpakai)}</td>
                  </tr>
                ))}</tbody></table>
            )}
            aksi={<button className="btn ghost" onClick={() => setSel(null)}>Tutup</button>} />
        )}
      </section>
    } />
  );
}

export function MasterPlan() {
  const p = sesi.pengguna;
  const { data, muat, muatUlang } = usePanggil(() => api.get('/plan/versi'), []);
  const [galat, setGalat] = useState(null);
  const [pesan, setPesan] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const [tahun, setTahun] = useState(TAHUN);
  const berkasRef = useRef();

  const unggah = async () => {
    const f = berkasRef.current?.files?.[0];
    if (!f) return;
    setSibuk(true); setGalat(null); setPesan(null);
    const fd = new FormData();
    fd.append('tahun', tahun); fd.append('berkas', f);
    try {
      const d = await api.post('/plan/unggah', fd);
      setPesan(`${d.pesan} ${d.ringkasan.barisPlafon} baris plafon, ${d.ringkasan.barisAlokasi} baris alokasi, total ${rp(d.ringkasan.totalPlafon)}.`);
      muatUlang();
    } catch (e) {
      setGalat(e.data?.galat?.length
        ? `${e.message}\n\n${e.data.galat.slice(0, 8).join('\n')}${e.data.jumlahGalat > 8 ? `\n… dan ${e.data.jumlahGalat - 8} lagi.` : ''}`
        : e.message);
    } finally { setSibuk(false); }
  };

  return (
    <Shell judul="Master Plan" anak={
      <>
        {p.peran === 'super_admin' && (
          <section className="card">
            <div className="chead"><h3>Unggah master plan</h3></div>
            {galat && <div className="pesan galat" style={{ whiteSpace: 'pre-wrap' }}>{galat}</div>}
            <Pesan jenis="sukses" anak={pesan} />
            <div className="baris dua">
              <label className="f"><span>Tahun anggaran</span>
                <input type="number" value={tahun} onChange={(e) => setTahun(Number(e.target.value))} /></label>
              <label className="f"><span>Berkas Excel</span>
                <input type="file" ref={berkasRef} accept=".xlsx" /></label>
            </div>
            <p className="sub">Wajib punya sheet <b>Plafon Region</b> dan <b>Alokasi Area</b>. Satu baris bermasalah membuat
              seluruh berkas ditolak — menyimpan sebagian menghasilkan master plan yang setengah valid, dan itu lebih
              berbahaya daripada gagal unggah.</p>
            <div className="aksi"><button className="btn primary" onClick={unggah} disabled={sibuk}>
              {sibuk ? 'Memvalidasi…' : 'Unggah dan validasi'}</button></div>
          </section>
        )}
        <section className="card">
          <div className="chead"><h3>Riwayat versi</h3></div>
          {muat ? <Memuat /> : !data?.length ? <Kosong teks="Belum ada master plan." /> : (
            <table><thead><tr><th>Tahun &amp; versi</th><th>Status</th><th className="ka">Total plafon</th>
              <th className="ka">Baris</th><th>Diunggah</th><th /></tr></thead>
              <tbody>{data.map((v) => (
                <tr key={v.id}>
                  <td><div className="num">{v.tahun} · versi {v.versi}</div>
                    {v.alasan && <div className="sub">{v.alasan}</div>}</td>
                  <td><span className={`chip ${v.status === 'berlaku' ? 'ok' : v.status === 'menunggu_persetujuan' ? 'warn' : 'abu'}`}>
                    {v.status.replace(/_/g, ' ')}</span></td>
                  <td className="ka num">{rpSingkat(v.total_plafon)}</td>
                  <td className="ka sub">{v.baris_region} / {v.baris_area}</td>
                  <td>{v.diunggah_oleh}<div className="sub">{tgl(v.diunggah_pada)}</div></td>
                  <td className="ka">{p.peran === 'atasan_3' && v.status === 'menunggu_persetujuan' && (
                    <>
                      <button className="btn setuju kecil" onClick={() => api.post(`/plan/versi/${v.id}/setujui`).then(muatUlang)}>Setujui</button>
                      <button className="btn bahaya kecil" style={{ marginLeft: 6 }}
                        onClick={() => { const a = prompt('Alasan penolakan'); if (a) api.post(`/plan/versi/${v.id}/tolak`, { alasan: a }).then(muatUlang); }}>Tolak</button>
                    </>
                  )}</td>
                </tr>
              ))}</tbody></table>
          )}
        </section>
      </>
    } />
  );
}
