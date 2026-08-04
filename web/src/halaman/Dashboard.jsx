import { Link, useNavigate } from 'react-router-dom';
import Shell from '../komponen/Shell.jsx';
import { api, sesi, rp, rpSingkat, persen, PERAN } from '../api.js';
import { usePanggil, Pil, Umur, Memuat, Kosong } from '../komponen/dasar.jsx';

const TAHUN = new Date().getFullYear();

/**
 * Layar kerja harian, bukan laporan. Isinya berbeda per peran karena yang
 * ditanyakan orang saat membuka aplikasi juga berbeda: Admin bertanya "apa yang
 * harus saya kerjakan", approver "apa yang menunggu saya", Finance "apa yang
 * harus dibayar".
 */
export default function Dashboard() {
  const p = sesi.pengguna;
  const nav = useNavigate();
  const ringkas = usePanggil(() => api.get(`/pagu/ringkasan?tahun=${TAHUN}`), []);
  const antrean = usePanggil(() => api.get('/pengajuan?antrean=1'), []);
  const milik = usePanggil(() => api.get('/pengajuan'), []);

  const t = ringkas.data?.total;
  const pakai = t ? (Number(t.terpakai) / Number(t.plafon)) * 100 : 0;
  const kunci = t ? (Number(t.terkunci) / Number(t.plafon)) * 100 : 0;

  const daftar = (milik.data ?? []);
  const perluTindakan = daftar.filter((x) =>
    (p.peran === 'admin' && ['draft', 'perlu_revisi'].includes(x.status)));

  return (
    <Shell judul={`Halo, ${p.nama.split(' ')[0]}`}
      aksi={p.peran === 'admin' && (
        <button className="btn primary" onClick={() => nav('/pengajuan/baru')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Pengajuan Baru
        </button>
      )}
      anak={
        <>
          <div className="grid" style={{ gridTemplateColumns: '352px 1fr' }}>
            <section className="card">
              <div className="chead"><span className="label">Sisa pagu nasional</span>
                <div className="kanan"><span className="chip abu">{TAHUN}</span></div></div>
              {ringkas.muat ? <Memuat /> : (
                <>
                  <div className="hero">{rp(t?.tersedia)}</div>
                  <span className={`chip ${pakai + kunci > 90 ? 'bad' : pakai + kunci > 70 ? 'warn' : 'ok'}`}>
                    {persen(100 - pakai - kunci)} dari plafon tahunan
                  </span>
                  <div className="stack">
                    <i style={{ width: `${pakai}%`, background: 'var(--green)' }} />
                    <i style={{ width: `${kunci}%`, background: 'var(--amber)' }} />
                  </div>
                  <div className="legend">
                    <span><i className="sq" style={{ background: 'var(--green)' }} />Terpakai</span>
                    <span><i className="sq" style={{ background: 'var(--amber)' }} />Terkunci</span>
                    <span><i className="sq" style={{ background: '#D9DADE' }} />Tersedia</span>
                  </div>
                  <div className="split">
                    <div><div className="k">Plafon</div><div className="v">{rpSingkat(t?.plafon)}</div></div>
                    <div><div className="k">Terpakai</div><div className="v">{rpSingkat(t?.terpakai)}</div></div>
                    <div><div className="k">Terkunci</div><div className="v">{rpSingkat(t?.terkunci)}</div></div>
                  </div>
                </>
              )}
            </section>

            <section className="card">
              <div className="chead"><h3>Serapan per region</h3>
                <div className="kanan"><Link className="sub" to="/pagu">Lihat detail</Link></div></div>
              {ringkas.muat ? <Memuat /> : (
                <table><thead><tr><th>Region</th><th className="ka">Plafon</th><th className="ka">Terpakai</th>
                  <th className="ka">Sisa</th><th className="ka">Serapan</th></tr></thead>
                  <tbody>
                    {(ringkas.data?.per_region ?? []).map((r) => {
                      const s = ((Number(r.terpakai) + Number(r.terkunci)) / Number(r.plafon)) * 100;
                      return (
                        <tr key={r.region}>
                          <td style={{ fontWeight: 600 }}>{r.region}</td>
                          <td className="ka num">{rpSingkat(r.plafon)}</td>
                          <td className="ka num">{rpSingkat(r.terpakai)}</td>
                          <td className="ka num" style={{ color: Number(r.tersedia) < 0 ? 'var(--red)' : undefined }}>
                            {rpSingkat(r.tersedia)}</td>
                          <td className="ka"><span className={`chip ${s > 95 ? 'bad' : s > 70 ? 'warn' : 'ok'}`}>{persen(s)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody></table>
              )}
            </section>
          </div>

          {['atasan_1', 'atasan_2', 'atasan_3', 'finance'].includes(p.peran) && (
            <section className="card">
              <div className="chead"><h3>Antrean Anda</h3>
                <div className="kanan"><span className="sub">{antrean.data?.length ?? 0} menunggu</span></div></div>
              {antrean.muat ? <Memuat /> : !antrean.data?.length ? <Kosong teks="Tidak ada yang menunggu persetujuan Anda." /> : (
                <table><thead><tr><th>Nomor &amp; program</th><th>Kota</th><th>Kategori</th>
                  <th className="ka">Nominal</th><th>Status</th><th className="ka">Umur</th></tr></thead>
                  <tbody>{antrean.data.map((x) => (
                    <tr key={x.id} className="klik" onClick={() => nav(`/pengajuan/${x.id}`)}>
                      <td><div className="num">{x.nomor}</div><div className="sub">{x.judul}</div>
                        {x.melebihi_pagu && <span className="chip bad" style={{ marginTop: 4 }}>Melebihi pagu</span>}
                        {x.minta_pembatalan && <span className="chip warn" style={{ marginTop: 4 }}>Diminta dibatalkan</span>}</td>
                      <td>{x.kota}<div className="sub">{x.region}</div></td>
                      <td>{x.kategori}</td>
                      <td className="ka num">{rp(x.total_nominal)}</td>
                      <td><Pil status={x.status} /></td>
                      <td className="ka"><Umur hari={x.umur_hari} /></td>
                    </tr>
                  ))}</tbody></table>
              )}
            </section>
          )}

          {p.peran === 'admin' && (
            <section className="card">
              <div className="chead"><h3>Perlu Anda kerjakan</h3></div>
              {milik.muat ? <Memuat /> : !perluTindakan.length ? <Kosong teks="Tidak ada draft atau revisi yang menunggu." /> : (
                <table><tbody>{perluTindakan.map((x) => (
                  <tr key={x.id} className="klik" onClick={() => nav(`/pengajuan/${x.id}`)}>
                    <td><div className="num">{x.nomor.startsWith('DRAFT') ? 'Draft' : x.nomor}</div>
                      <div className="sub">{x.judul}</div></td>
                    <td>{x.kota}</td>
                    <td className="ka num">{rp(x.total_nominal)}</td>
                    <td><Pil status={x.status} /></td>
                  </tr>
                ))}</tbody></table>
              )}
            </section>
          )}

          <section className="card">
            <div className="chead"><h3>Pengajuan terbaru</h3>
              <div className="kanan"><Link className="sub" to="/pengajuan">Lihat semua</Link></div></div>
            {milik.muat ? <Memuat /> : !daftar.length ? <Kosong teks="Belum ada pengajuan." /> : (
              <table><thead><tr><th>Nomor &amp; program</th><th>Kota</th><th>Kategori</th>
                <th className="ka">Nominal</th><th>Status</th><th className="ka">Umur</th></tr></thead>
                <tbody>{daftar.slice(0, 8).map((x) => (
                  <tr key={x.id} className="klik" onClick={() => nav(`/pengajuan/${x.id}`)}>
                    <td><div className="num">{x.nomor.startsWith('DRAFT') ? 'Draft' : x.nomor}</div><div className="sub">{x.judul}</div></td>
                    <td>{x.kota}<div className="sub">{x.region}</div></td>
                    <td>{x.kategori}</td>
                    <td className="ka num">{rp(x.total_nominal)}</td>
                    <td><Pil status={x.status} /></td>
                    <td className="ka"><Umur hari={x.umur_hari} /></td>
                  </tr>
                ))}</tbody></table>
            )}
          </section>
        </>
      } />
  );
}
