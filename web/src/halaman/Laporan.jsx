import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Shell from '../komponen/Shell.jsx';
import { api, rp, rpSingkat, persen, tgl, NAMA_BULAN } from '../api.js';
import { usePanggil, Memuat, Kosong } from '../komponen/dasar.jsx';

const TAHUN = new Date().getFullYear();

export default function Laporan() {
  const [tab, setTab] = useState('pengecualian');
  const nav = useNavigate();
  const d = usePanggil(() => api.get(`/laporan/${tab === 'kecepatan' ? 'kecepatan' : tab}?tahun=${TAHUN}`), [tab]);

  return (
    <Shell judul="Laporan" anak={
      <>
        <div className="tab">
          <button className={tab === 'pengecualian' ? 'on' : ''} onClick={() => setTab('pengecualian')}>Over-budget &amp; pengecualian</button>
          <button className={tab === 'lpj' ? 'on' : ''} onClick={() => setTab('lpj')}>Disiplin LPJ</button>
          <button className={tab === 'kecepatan' ? 'on' : ''} onClick={() => setTab('kecepatan')}>Kecepatan approval</button>
        </div>

        {d.muat ? <section className="card"><Memuat /></section> : tab === 'pengecualian' ? (
          <>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <section className="card"><span className="label">Kombinasi menembus plafon</span>
                <div className="hero" style={{ fontSize: 26 }}>{d.data?.ringkas.kombinasi_jebol ?? 0}</div>
                <span className="sub">total kelebihan {rp(d.data?.total_kelebihan)}</span></section>
              <section className="card"><span className="label">Lolos tanpa Atasan 3</span>
                <div className="hero" style={{ fontSize: 26 }}>{d.data?.ringkas.lolos_tanpa_atasan_3 ?? 0}</div>
                <span className="sub">senilai {rp(d.data?.ringkas.nilai_jalur_cepat)}</span></section>
              <section className="card"><span className="label">Pengajuan melebihi pagu</span>
                <div className="hero" style={{ fontSize: 26 }}>{d.data?.pengajuan_melebihi_pagu.length ?? 0}</div>
                <span className="sub">seluruhnya melalui Atasan 3</span></section>
            </div>
            <section className="card">
              <div className="chead"><h3>Kombinasi melebihi plafon region</h3>
                <div className="kanan"><a className="btn ghost kecil" href={`/api/laporan/pengecualian/excel?tahun=${TAHUN}`}>Ekspor Excel</a></div></div>
              {!d.data?.kombinasi_melebihi_plafon.length ? <Kosong teks="Tidak ada region yang menembus plafonnya." /> : (
                <table><thead><tr><th>Region</th><th>Kategori</th><th>Bulan</th>
                  <th className="ka">Plafon</th><th className="ka">Kelebihan</th></tr></thead>
                  <tbody>{d.data.kombinasi_melebihi_plafon.map((x, i) => (
                    <tr key={i}><td style={{ fontWeight: 600 }}>{x.region}</td><td>{x.kategori}</td>
                      <td>{NAMA_BULAN[x.bulan]}</td><td className="ka num">{rpSingkat(x.plafon)}</td>
                      <td className="ka num" style={{ color: 'var(--red)' }}>{rp(x.kelebihan)}</td></tr>
                  ))}</tbody></table>
              )}
            </section>
            <section className="card">
              <div className="chead"><h3>Pengajuan lolos jalur cepat</h3>
                <div className="kanan"><span className="sub">tidak melalui Atasan 3</span></div></div>
              {!d.data?.pengajuan_jalur_cepat.length ? <Kosong teks="Belum ada." /> : (
                <table><thead><tr><th>Nomor</th><th>Kota</th><th>Kategori</th>
                  <th className="ka">Nominal</th><th>Disetujui oleh</th></tr></thead>
                  <tbody>{d.data.pengajuan_jalur_cepat.map((x) => (
                    <tr key={x.id} className="klik" onClick={() => nav(`/pengajuan/${x.id}`)}>
                      <td><div className="num">{x.nomor}</div><div className="sub">{x.judul}</div></td>
                      <td>{x.kota}<div className="sub">{x.region}</div></td><td>{x.kategori}</td>
                      <td className="ka num">{rp(x.total_nominal)}</td><td>{x.disetujui_oleh ?? '—'}</td></tr>
                  ))}</tbody></table>
              )}
            </section>
          </>
        ) : tab === 'lpj' ? (
          <>
            <section className="card">
              <div className="chead"><h3>Menunggak</h3></div>
              {!d.data?.menunggak.length ? <Kosong teks="Tidak ada LPJ yang menunggak." /> : (
                <table><thead><tr><th>Nomor</th><th>Kota</th><th className="ka">Nominal</th>
                  <th>Batas</th><th className="ka">Telat</th></tr></thead>
                  <tbody>{d.data.menunggak.map((x) => (
                    <tr key={x.id} className="klik" onClick={() => nav(`/pengajuan/${x.id}`)}>
                      <td><div className="num">{x.nomor}</div><div className="sub">{x.judul}</div></td>
                      <td>{x.kota}<div className="sub">{x.region}</div></td>
                      <td className="ka num">{rp(x.total_nominal)}</td><td>{tgl(x.batas_lpj)}</td>
                      <td className="ka"><span className="chip bad">{x.telat_hari} hari</span></td></tr>
                  ))}</tbody></table>
              )}
            </section>
            <section className="card">
              <div className="chead"><h3>Disiplin per kota</h3></div>
              <table><thead><tr><th>Kota</th><th>Region</th><th className="ka">Wajib LPJ</th><th className="ka">Selesai</th>
                <th className="ka">Menunggak</th><th className="ka">Rata hari</th><th className="ka">Sisa dikembalikan</th></tr></thead>
                <tbody>{(d.data?.per_kota ?? []).map((x, i) => (
                  <tr key={i}><td style={{ fontWeight: 600 }}>{x.kota}</td><td>{x.region}</td>
                    <td className="ka">{x.wajib_lpj}</td><td className="ka">{x.selesai}</td>
                    <td className="ka">{Number(x.menunggak) > 0 ? <span className="chip bad">{x.menunggak}</span> : '—'}</td>
                    <td className="ka">{x.rata_hari_selesai ?? '—'}</td>
                    <td className="ka num">{rp(x.total_sisa_dikembalikan)}</td></tr>
                ))}</tbody></table>
            </section>
            <section className="card">
              <div className="chead"><h3>Selisih rencana terhadap realisasi</h3></div>
              {!d.data?.selisih_rencana_realisasi.length ? <Kosong teks="Belum ada LPJ yang disetujui." /> : (
                <table><thead><tr><th>Kota</th><th className="ka">Rencana</th><th className="ka">Realisasi</th>
                  <th className="ka">Selisih</th><th className="ka">Penyerapan</th></tr></thead>
                  <tbody>{d.data.selisih_rencana_realisasi.map((x, i) => (
                    <tr key={i}><td style={{ fontWeight: 600 }}>{x.kota}<div className="sub">{x.region}</div></td>
                      <td className="ka num">{rp(x.rencana)}</td><td className="ka num">{rp(x.realisasi)}</td>
                      <td className="ka num">{rp(x.selisih)}</td>
                      <td className="ka"><span className={`chip ${x.penyerapan_persen < 70 ? 'warn' : 'ok'}`}>{persen(x.penyerapan_persen)}</span></td></tr>
                  ))}</tbody></table>
              )}
            </section>
          </>
        ) : (
          <>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <section className="card"><span className="label">Rata-rata dari kirim sampai selesai</span>
                <div className="hero" style={{ fontSize: 26 }}>{d.data?.rata_hari_total ?? '—'} hari</div>
                <span className="sub">{d.data?.jumlah_selesai ?? 0} pengajuan selesai</span></section>
              <section className="card"><span className="label">Sedang menggantung</span>
                <div className="hero" style={{ fontSize: 26 }}>{d.data?.menggantung.length ?? 0}</div>
                <span className="sub">belum ditindak siapa pun</span></section>
            </div>
            <section className="card">
              <div className="chead"><h3>Rata-rata per tahap</h3>
                <div className="kanan"><span className="sub">di sinilah alur sebenarnya tersendat</span></div></div>
              <table><thead><tr><th>Tahap</th><th className="ka">Jumlah</th><th className="ka">Rata-rata</th><th className="ka">Terlama</th></tr></thead>
                <tbody>{(d.data?.per_tahap ?? []).map((x, i) => (
                  <tr key={i}><td>{(x.tahap ?? '').replace(/_/g, ' ')}</td><td className="ka">{x.jumlah}</td>
                    <td className="ka num">{x.rata_hari} hari</td><td className="ka num">{x.terlama_hari} hari</td></tr>
                ))}</tbody></table>
            </section>
            <section className="card">
              <div className="chead"><h3>Menggantung sekarang</h3></div>
              {!d.data?.menggantung.length ? <Kosong teks="Tidak ada yang menggantung." /> : (
                <table><thead><tr><th>Nomor</th><th>Kota</th><th className="ka">Nominal</th><th>Status</th><th className="ka">Umur</th></tr></thead>
                  <tbody>{d.data.menggantung.map((x) => (
                    <tr key={x.id} className="klik" onClick={() => nav(`/pengajuan/${x.id}`)}>
                      <td><div className="num">{x.nomor}</div><div className="sub">{x.judul}</div></td>
                      <td>{x.kota}<div className="sub">{x.region}</div></td>
                      <td className="ka num">{rp(x.total_nominal)}</td>
                      <td className="sub">{x.status.replace(/_/g, ' ')}</td>
                      <td className="ka"><span className={`age${x.umur_hari >= 4 ? ' hot' : ''}`}>{x.umur_hari} hari</span></td></tr>
                  ))}</tbody></table>
              )}
            </section>
          </>
        )}
      </>
    } />
  );
}
