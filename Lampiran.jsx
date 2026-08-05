import { useRef, useState } from 'react';
import { api, sesi, ambilBerkas, unduhBerkas, bisaPratinjau } from '../api.js';
import { usePanggil, Kosong, Pesan, Modal } from './dasar.jsx';

const JENIS = {
  pengajuan: [['penawaran', 'Penawaran vendor'], ['proposal', 'Proposal program'], ['pendukung', 'Foto atau dokumen pendukung']],
  pembayaran: [['invoice', 'Invoice'], ['bukti_transfer', 'Bukti transfer']],
  lpj: [['nota', 'Nota atau kuitansi'], ['bukti_setor', 'Bukti setor sisa dana'], ['dokumentasi', 'Dokumentasi pelaksanaan']],
};

const ukuran = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

/** Unggahan lampiran. Berkas disimpan terpisah dari basis data. */
export default function Lampiran({ pemilikJenis, pemilikId, bisaUbah = true }) {
  const { data, muat, muatUlang } = usePanggil(
    () => api.get(`/lampiran?pemilik_jenis=${pemilikJenis}&pemilik_id=${pemilikId}`), [pemilikId]);
  const [jenis, setJenis] = useState(JENIS[pemilikJenis][0][0]);
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const [lihat, setLihat] = useState(null);
  const ref = useRef();

  // URL objek dicabut saat pratinjau ditutup, kalau tidak berkas menumpuk di
  // memori peramban selama halaman terbuka.
  const bukaPratinjau = async (l) => {
    setGalat(null);
    try {
      const { url } = await ambilBerkas(`/lampiran/${l.id}/unduh`);
      setLihat({ ...l, url });
    } catch (e) { setGalat(e.message); }
  };
  const tutupPratinjau = () => {
    if (lihat?.url) URL.revokeObjectURL(lihat.url);
    setLihat(null);
  };

  const unggah = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setSibuk(true); setGalat(null);
    const fd = new FormData();
    fd.append('berkas', f); fd.append('pemilik_jenis', pemilikJenis);
    fd.append('pemilik_id', pemilikId); fd.append('jenis', jenis);
    try { await api.post('/lampiran', fd); muatUlang(); }
    catch (x) { setGalat(x.message); }
    finally { setSibuk(false); if (ref.current) ref.current.value = ''; }
  };

  return (
    <section className="card">
      <div className="chead"><h3>Lampiran</h3>
        <div className="kanan"><span className="sub">{data?.length ?? 0} berkas</span></div></div>
      <Pesan anak={galat} />
      {muat ? null : !data?.length ? <Kosong teks="Belum ada lampiran." /> : (
        <table><tbody>{data.map((l) => (
          <tr key={l.id}>
            <td><b>{l.nama_berkas}</b>
              <div className="sub">{l.jenis.replace(/_/g, ' ')} · {ukuran(l.ukuran_byte)} · {l.diunggah_oleh_nama}</div></td>
            <td className="ka" style={{ whiteSpace: 'nowrap' }}>
              {bisaPratinjau(l.nama_berkas) && (
                <button className="btn ghost kecil" onClick={() => bukaPratinjau(l)}>Pratinjau</button>)}
              <button className="btn ghost kecil" style={{ marginLeft: 6 }}
                onClick={() => unduhBerkas(`/lampiran/${l.id}/unduh`, l.nama_berkas).catch((e) => setGalat(e.message))}>
                Unduh</button>
              {bisaUbah && (
                <button className="btn bahaya kecil" style={{ marginLeft: 6 }}
                  onClick={() => api.hapus(`/lampiran/${l.id}`).then(muatUlang).catch((e) => setGalat(e.message))}>
                  Hapus</button>)}
            </td>
          </tr>
        ))}</tbody></table>
      )}
      {bisaUbah && (
        <div className="baris dua" style={{ marginTop: 14 }}>
          <label className="f" style={{ marginBottom: 0 }}><span>Jenis lampiran</span>
            <select value={jenis} onChange={(e) => setJenis(e.target.value)}>
              {JENIS[pemilikJenis].map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <label className="f" style={{ marginBottom: 0 }}><span>Pilih berkas</span>
            <input type="file" ref={ref} onChange={unggah} disabled={sibuk}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx" /></label>
        </div>
      )}
      <p className="sub" style={{ marginTop: 10 }}>PDF, gambar, Excel, atau Word. Maksimal 10 MB per berkas.
        Pratinjau tersedia untuk PDF dan gambar; berkas Excel dan Word perlu diunduh.</p>

      {lihat && (
        <Modal tutup={tutupPratinjau} judul={lihat.nama_berkas}
          catatan={`${lihat.jenis.replace(/_/g, ' ')} · ${ukuran(lihat.ukuran_byte)} · diunggah ${lihat.diunggah_oleh_nama}`}
          anak={/\.pdf$/i.test(lihat.nama_berkas)
            ? <iframe title={lihat.nama_berkas} src={lihat.url}
                style={{ width: '100%', height: '62vh', border: '1px solid var(--line)', borderRadius: 'var(--r-ctl)' }} />
            : <img alt={lihat.nama_berkas} src={lihat.url}
                style={{ width: '100%', borderRadius: 'var(--r-ctl)', border: '1px solid var(--line)' }} />}
          aksi={<>
            <button className="btn ghost" onClick={tutupPratinjau}>Tutup</button>
            <button className="btn primary"
              onClick={() => unduhBerkas(`/lampiran/${lihat.id}/unduh`, lihat.nama_berkas)}>Unduh</button>
          </>} />
      )}
    </section>
  );
}
