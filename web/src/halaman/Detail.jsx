import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Shell from '../komponen/Shell.jsx';
import { api, sesi, rp, persen, tgl, NAMA_BULAN, bukaSurat } from '../api.js';
import { usePanggil, Pil, Memuat, Modal, Pesan } from '../komponen/dasar.jsx';
import Lampiran from '../komponen/Lampiran.jsx';

const PEMEGANG = {
  menunggu_atasan_1: 'atasan_1', menunggu_atasan_2: 'atasan_2',
  menunggu_atasan_3: 'atasan_3', menunggu_finance: 'finance',
};

export default function DetailPengajuan() {
  const { id } = useParams();
  const nav = useNavigate();
  const p = sesi.pengguna;
  const { data: d, muat, muatUlang } = usePanggil(() => api.get(`/pengajuan/${id}`), [id]);
  const pratinjau = usePanggil(() => api.get(`/pengajuan/${id}/pratinjau`).catch(() => null), [id]);
  const [dialog, setDialog] = useState(null);
  const [alasan, setAlasan] = useState('');
  const [galat, setGalat] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  if (muat || !d) return <Shell judul="Pengajuan" anak={<section className="card"><Memuat /></section>} />;

  const bisaTindak = PEMEGANG[d.status] === p.peran && Number(d.dibuat_oleh) !== Number(p.id);
  const bisaEdit = p.peran === 'admin' && ['draft', 'perlu_revisi'].includes(d.status);
  const cek = pratinjau.data;

  const jalankan = async (fn) => {
    setSibuk(true); setGalat(null);
    try { await fn(); setDialog(null); setAlasan(''); muatUlang(); pratinjau.muatUlang(); }
    catch (e) { setGalat(e.message); } finally { setSibuk(false); }
  };

  const kirim = () => jalankan(() => api.post(`/pengajuan/${id}/submit`, {
    justifikasi_cost_ratio: alasan || undefined, alasan_melebihi_pagu: alasan || undefined,
  }));

  return (
    <Shell judul={d.nomor.startsWith('DRAFT') ? 'Draft pengajuan' : d.nomor}
      aksi={
        <>
          {d.status !== 'draft' && (
            <button className="btn ghost" onClick={() => bukaSurat(`/pengajuan/${id}/surat`).catch((e) => setGalat(e.message))}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" />
              </svg>
              Cetak surat
            </button>
          )}
          {bisaEdit && <button className="btn primary" onClick={() => setDialog('kirim')}>Kirim pengajuan</button>}
          {bisaTindak && <>
            <button className="btn setuju" onClick={() => setDialog('approve')}>Setujui</button>
            <button className="btn ghost" onClick={() => setDialog('revisi')}>Minta revisi</button>
            <button className="btn bahaya" onClick={() => setDialog('reject')}>Tolak</button>
          </>}
          {p.peran === 'admin' && !['selesai', 'ditolak', 'dibatalkan'].includes(d.status) &&
            <button className="btn ghost" onClick={() => setDialog('batal')}>Batalkan</button>}
        </>
      }
      anak={
        <div className="grid" style={{ gridTemplateColumns: '1fr 336px', alignItems: 'start' }}>
          <div className="grid">
            <section className="card">
              <div className="chead">
                <h3>{d.judul}</h3>
                <div className="kanan"><Pil status={d.status} />{d.versi_no > 1 && <span className="chip abu">versi {d.versi_no}</span>}</div>
              </div>
              {d.melebihi_pagu && <div className="pesan galat">
                Melebihi sisa pagu region — wajib melalui Atasan 3. Alasan: {d.alasan_melebihi_pagu}</div>}
              {d.jalur_cepat && <div className="pesan info">
                Lolos jalur cepat: di bawah batas pagu Atasan 2 dan pagu region cukup. Atasan 3 hanya diberi tahu.</div>}
              {d.minta_pembatalan && <div className="pesan galat">
                Pemohon meminta pembatalan. Approver yang memegangnya perlu menolak dengan alasan "dibatalkan pemohon".</div>}
              <div className="baris tiga">
                <div><div className="k label">Kota</div><b>{d.kota}</b><div className="sub">{d.area} · {d.region}</div></div>
                <div><div className="k label">Kategori</div><b>{d.kategori}</b>
                  <div className="sub">{NAMA_BULAN[d.periode_bulan]} {d.periode_tahun}</div></div>
                <div><div className="k label">Program berjalan</div><b>{tgl(d.tgl_mulai)}</b>
                  <div className="sub">sampai {tgl(d.tgl_selesai)}</div></div>
              </div>
              {d.tujuan && <p className="sub" style={{ marginTop: 14 }}>{d.tujuan}</p>}
            </section>

            <section className="card">
              <div className="chead"><h3>Rincian item</h3>
                {bisaEdit && <div className="kanan"><Link className="btn ghost kecil" to={`/pengajuan/${id}/item`}>Ubah rincian</Link></div>}</div>
              <table><thead><tr><th>Item</th><th className="ka">Qty</th><th>Satuan</th>
                <th className="ka">Harga satuan</th><th className="ka">Subtotal</th></tr></thead>
                <tbody>{(d.item ?? []).map((x) => (
                  <tr key={x.id}><td>{x.nama}</td><td className="ka">{Number(x.qty)}</td><td>{x.satuan ?? '—'}</td>
                    <td className="ka num">{rp(x.harga_satuan)}</td><td className="ka num">{rp(x.subtotal)}</td></tr>
                ))}</tbody></table>
              <div className="split"><div><div className="k">Total nominal</div>
                <div className="v" style={{ fontSize: 20 }}>{rp(d.total_nominal)}</div></div>
                <div><div className="k">Penerima</div><div className="v" style={{ fontSize: 14 }}>{d.penerima ?? '—'}</div>
                  <div className="sub">{(d.jenis_penerima ?? '').replace('_', ' ')}</div></div></div>
            </section>

            <Lampiran pemilikJenis="pengajuan" pemilikId={id}
              bisaUbah={!['ditolak', 'dibatalkan'].includes(d.status)} />

            <section className="card">
              <div className="chead"><h3>Riwayat</h3></div>
              <table><tbody>{(d.riwayat ?? []).map((r, i) => (
                <tr key={i}>
                  <td style={{ width: 150 }}><div className="sub">{new Date(r.waktu).toLocaleString('id-ID')}</div></td>
                  <td><b>{r.aksi}</b> <span className="sub">v{r.versi}</span>
                    {r.alasan && <div className="sub">{r.alasan}</div>}</td>
                  <td>{r.oleh ?? 'sistem'}{r.atas_nama && <div className="sub">atas nama {r.atas_nama}</div>}</td>
                  <td><Pil status={r.ke} /></td>
                </tr>
              ))}</tbody></table>
            </section>
          </div>

          <div className="grid">
            <section className="card">
              <div className="chead"><h3>Konteks keputusan</h3></div>
              {!cek ? <Memuat /> : (
                <>
                  <div className="k label">Sisa pagu area</div>
                  <div className="num" style={{ fontSize: 15, marginBottom: 10 }}>{rp(cek.pagu?.snapshot?.sisa_area)}</div>
                  <div className="k label">Sisa pagu region</div>
                  <div className="num" style={{ fontSize: 15, marginBottom: 14,
                    color: Number(cek.pagu?.snapshot?.sisa_region) < 0 ? 'var(--red)' : undefined }}>
                    {rp(cek.pagu?.snapshot?.sisa_region)}</div>
                  <div className="rule" style={{ margin: '0 0 14px' }} />
                  <div className="k label">Histori Selling Out 3 bulan</div>
                  <div className="num" style={{ fontSize: 14 }}>{rp(cek.konteks?.snap_histori_total)}</div>
                  <div className="sub" style={{ marginBottom: 10 }}>rata-rata {rp(cek.konteks?.snap_histori_rata2)}</div>
                  <div className="k label">Target kota periode ini</div>
                  <div className="num" style={{ fontSize: 14, marginBottom: 12 }}>
                    {cek.konteks?.snap_target === null ? <span style={{ color: 'var(--red)' }}>belum tersedia</span> : rp(cek.konteks?.snap_target)}</div>
                  <div className="split" style={{ marginTop: 0 }}>
                    <div><div className="k">Cost ratio pengajuan</div>
                      <div className="v" style={{ color: cek.konteks?.snap_cost_ratio_ini > cek.konteks?.snap_ambang_cost_ratio ? 'var(--red)' : undefined }}>
                        {cek.konteks?.snap_cost_ratio_ini == null ? '—' : persen(cek.konteks.snap_cost_ratio_ini * 100)}</div></div>
                    <div><div className="k">Cost ratio periode</div>
                      <div className="v" style={{ color: cek.konteks?.snap_cost_ratio_periode > cek.konteks?.snap_ambang_cost_ratio ? 'var(--red)' : undefined }}>
                        {cek.konteks?.snap_cost_ratio_periode == null ? '—' : persen(cek.konteks.snap_cost_ratio_periode * 100)}</div></div>
                  </div>
                  <p className="sub" style={{ marginTop: 10 }}>Ambang {persen((cek.konteks?.snap_ambang_cost_ratio ?? 0) * 100)}.
                    Angka dibekukan saat pengajuan dikirim.</p>
                  {d.justifikasi_cost_ratio && <div className="pesan info" style={{ marginTop: 12 }}>
                    <b>Justifikasi cost ratio:</b> {d.justifikasi_cost_ratio}</div>}
                </>
              )}
            </section>
          </div>

          {dialog && (
            <Modal tutup={() => { setDialog(null); setGalat(null); }}
              judul={{ kirim: 'Kirim pengajuan', approve: 'Setujui pengajuan', revisi: 'Minta revisi',
                reject: 'Tolak pengajuan', batal: 'Batalkan pengajuan' }[dialog]}
              catatan={{
                kirim: 'Pagu akan dikunci dan angka konteks dibekukan. Setelah terkirim, perubahan hanya lewat revisi.',
                approve: 'Sistem menentukan tahap berikutnya secara otomatis berdasarkan pagu dan nominal.',
                revisi: 'Pengajuan kembali ke Admin dan alurnya diulang dari Atasan 1 dengan versi baru.',
                reject: 'Penolakan bersifat final. Pagu yang terkunci akan dilepas.',
                batal: 'Bila pengajuan sudah berjalan, ini hanya mengirim permintaan ke approver yang memegangnya.',
              }[dialog]}
              anak={<>
                <Pesan anak={galat} />
                {dialog !== 'approve' && (
                  <label className="f"><span>{dialog === 'kirim' ? 'Justifikasi atau alasan (bila diminta sistem)' : 'Alasan'}</span>
                    <textarea rows="3" value={alasan} onChange={(e) => setAlasan(e.target.value)} autoFocus /></label>
                )}
              </>}
              aksi={<>
                <button className="btn ghost" onClick={() => setDialog(null)}>Batal</button>
                <button className={`btn ${dialog === 'reject' ? 'bahaya' : 'primary'}`} disabled={sibuk ||
                  (['revisi', 'reject'].includes(dialog) && !alasan)}
                  onClick={() => dialog === 'kirim' ? kirim()
                    : dialog === 'batal' ? jalankan(() => api.post(`/pengajuan/${id}/batal`, { alasan }))
                    : jalankan(() => api.post(`/pengajuan/${id}/aksi`, { aksi: dialog, alasan }))}>
                  {sibuk ? 'Memproses…' : 'Lanjutkan'}
                </button>
              </>} />
          )}
        </div>
      } />
  );
}
