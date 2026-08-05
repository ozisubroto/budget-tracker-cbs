import { useState } from 'react';
import Shell from '../komponen/Shell.jsx';
import { api, sesi, rp, tgl, PERAN } from '../api.js';
import { usePanggil, Memuat, Kosong, Modal, Pesan } from '../komponen/dasar.jsx';

const LABEL = {
  batas_pagu_atasan_2: ['Batas pagu Atasan 2', 'Di bawah nilai ini pengajuan lompat langsung ke Finance.', 'rp'],
  ambang_cost_ratio: ['Ambang cost ratio', 'Justifikasi wajib bila terlampaui.', 'persen'],
  batas_waktu_lpj_hari: ['Batas waktu LPJ', 'Dihitung dari tanggal selesai program.', 'hari'],
  ambang_penutupan_persen: ['Ambang alasan penutupan', 'Selisih pembayaran di atas ini wajib beralasan.', 'persen'],
  ambang_penutupan_rupiah: ['Ambang alasan penutupan (rupiah)', 'Dipakai bila lebih kecil dari ambang persen.', 'rp'],
};
const WAJIB_ATASAN_3 = ['batas_pagu_atasan_2', 'ambang_cost_ratio'];
const tampil = (kode, n) => LABEL[kode]?.[2] === 'persen' ? `${(Number(n) * 100).toFixed(1)}%`
  : LABEL[kode]?.[2] === 'hari' ? `${Number(n)} hari` : rp(n);

export function Pengaturan() {
  const p = sesi.pengguna;
  const kini = usePanggil(() => api.get('/master/pengaturan'), []);
  const riwayat = usePanggil(() => api.get('/master/pengaturan/riwayat').catch(() => []), []);
  const pengguna = usePanggil(() => api.get('/master/pengguna'), []);
  const [ubah, setUbah] = useState(null);
  const [nilai, setNilai] = useState('');
  const [galat, setGalat] = useState(null);
  const [editPengguna, setEditPengguna] = useState(null);
  const [fPengguna, setFPengguna] = useState({ nama: '', jabatan: '', no_wa: '' });
  const [galatPengguna, setGalatPengguna] = useState(null);
  const [sibukPengguna, setSibukPengguna] = useState(false);

  const bukaEditPengguna = (u) => {
    setGalatPengguna(null);
    setFPengguna({ nama: u.nama, jabatan: u.jabatan ?? '', no_wa: u.no_wa ?? '' });
    setEditPengguna(u);
  };

  const simpanPengguna = async () => {
    setSibukPengguna(true); setGalatPengguna(null);
    try {
      await api.patch(`/master/pengguna/${editPengguna.id}`, fPengguna);
      setEditPengguna(null); pengguna.muatUlang();
    } catch (e) { setGalatPengguna(e.message); } finally { setSibukPengguna(false); }
  };

  const menunggu = (riwayat.data ?? []).filter((x) => x.status === 'menunggu_persetujuan');

  const simpan = async () => {
    setGalat(null);
    try {
      const n = LABEL[ubah][2] === 'persen' ? Number(nilai) / 100 : Number(nilai);
      await api.post('/master/pengaturan', { kode: ubah, nilai: n });
      setUbah(null); kini.muatUlang(); riwayat.muatUlang();
    } catch (e) { setGalat(e.message); }
  };

  return (
    <Shell judul="Pengaturan" anak={
      <>
        {menunggu.length > 0 && (
          <section className="card">
            <div className="chead"><h3>Menunggu persetujuan Atasan 3</h3></div>
            <p className="sub" style={{ marginBottom: 14 }}>Dua pengaturan ini menentukan seberapa banyak yang lolos tanpa
              pengawasan, jadi tidak berubah hanya karena satu akun teknis menekan simpan. Nilai lama tetap berlaku
              sampai disetujui.</p>
            <table><tbody>{menunggu.map((x) => (
              <tr key={x.id}>
                <td><b>{LABEL[x.kode]?.[0] ?? x.kode}</b><div className="sub">diusulkan {x.diusulkan_oleh_nama}</div></td>
                <td className="ka num">{tampil(x.kode, x.nilai)}</td>
                <td className="ka">{p.peran === 'atasan_3' &&
                  <button className="btn setuju kecil" onClick={() =>
                    api.post(`/master/pengaturan/${x.id}/setujui`).then(() => { kini.muatUlang(); riwayat.muatUlang(); })}>
                    Setujui</button>}</td>
              </tr>
            ))}</tbody></table>
          </section>
        )}

        <section className="card">
          <div className="chead"><h3>Pengaturan berlaku</h3></div>
          {kini.muat ? <Memuat /> : (
            <table><tbody>{Object.entries(kini.data ?? {}).map(([k, v]) => (
              <tr key={k}>
                <td><b>{LABEL[k]?.[0] ?? k}</b><div className="sub">{LABEL[k]?.[1]}</div></td>
                <td className="ka num" style={{ fontSize: 14 }}>{tampil(k, v)}</td>
                <td className="ka">
                  {WAJIB_ATASAN_3.includes(k) && <span className="chip warn" style={{ marginRight: 8 }}>perlu Atasan 3</span>}
                  {p.peran === 'super_admin' && <button className="btn ghost kecil"
                    onClick={() => { setUbah(k); setNilai(LABEL[k]?.[2] === 'persen' ? (Number(v) * 100).toFixed(1) : String(Number(v))); }}>
                    Ubah</button>}
                </td>
              </tr>
            ))}</tbody></table>
          )}
        </section>

        <section className="card">
          <div className="chead"><h3>Pengguna</h3></div>
          {pengguna.muat ? <Memuat /> : (
            <table><thead><tr><th>Nama &amp; jabatan</th><th>Peran</th><th>Email</th><th>WhatsApp</th>
              <th className="ka">Status</th><th /></tr></thead>
              <tbody>{(pengguna.data ?? []).map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.nama}<div className="sub" style={{ fontWeight: 500 }}>{u.jabatan || '—'}</div></td>
                  <td>{PERAN[u.peran]}</td>
                  <td className="sub">{u.email}</td>
                  <td>{u.no_wa ?? <span className="sub">belum diisi</span>}</td>
                  <td className="ka"><span className={`chip ${u.aktif ? 'ok' : 'abu'}`}>{u.aktif ? 'aktif' : 'nonaktif'}</span></td>
                  <td className="ka"><button className="btn ghost kecil" onClick={() => bukaEditPengguna(u)}>Ubah</button></td>
                </tr>
              ))}</tbody></table>
          )}
          <p className="sub" style={{ marginTop: 12 }}>Nomor WhatsApp yang kosong berarti orang itu hanya menerima notifikasi
            di dalam aplikasi.</p>
        </section>

        {editPengguna && (
          <Modal tutup={() => setEditPengguna(null)} judul={`Ubah ${editPengguna.nama}`}
            catatan="Email dan peran tidak dapat diubah dari sini — keduanya menentukan hak akses dan riwayat audit."
            anak={<>
              <Pesan anak={galatPengguna} />
              <label className="f"><span>Nama</span>
                <input value={fPengguna.nama} onChange={(e) => setFPengguna({ ...fPengguna, nama: e.target.value })} autoFocus /></label>
              <label className="f"><span>Jabatan</span>
                <input value={fPengguna.jabatan} onChange={(e) => setFPengguna({ ...fPengguna, jabatan: e.target.value })}
                  placeholder="mis. GM Sales Offline" /></label>
              <label className="f"><span>Nomor WhatsApp</span>
                <input value={fPengguna.no_wa} onChange={(e) => setFPengguna({ ...fPengguna, no_wa: e.target.value })}
                  placeholder="6281234567890" /></label>
              <p className="sub">Nomor tanpa tanda plus atau spasi, diawali kode negara. Kosongkan bila orang ini hanya
                menerima notifikasi di dalam aplikasi.</p>
            </>}
            aksi={<>
              <button className="btn ghost" onClick={() => setEditPengguna(null)}>Batal</button>
              <button className="btn primary" disabled={sibukPengguna || !fPengguna.nama} onClick={simpanPengguna}>
                {sibukPengguna ? 'Menyimpan…' : 'Simpan'}</button>
            </>} />
        )}

        {ubah && (
          <Modal tutup={() => setUbah(null)} judul={`Ubah ${LABEL[ubah][0]}`}
            catatan={WAJIB_ATASAN_3.includes(ubah)
              ? 'Perubahan ini baru berlaku setelah disetujui Atasan 3. Nilai lama tetap dipakai sampai saat itu.'
              : 'Berlaku segera setelah disimpan.'}
            anak={<><Pesan anak={galat} />
              <label className="f"><span>Nilai baru {LABEL[ubah][2] === 'persen' ? '(persen)' : LABEL[ubah][2] === 'hari' ? '(hari)' : '(rupiah)'}</span>
                <input type="number" step="any" value={nilai} onChange={(e) => setNilai(e.target.value)} autoFocus /></label></>}
            aksi={<><button className="btn ghost" onClick={() => setUbah(null)}>Batal</button>
              <button className="btn primary" onClick={simpan}>Simpan</button></>} />
        )}
      </>
    } />
  );
}

export function Delegasi() {
  const p = sesi.pengguna;
  const { data, muat, muatUlang } = usePanggil(() => api.get('/delegasi'), []);
  const pengguna = usePanggil(() => api.get('/master/pengguna'), []);
  const [buka, setBuka] = useState(false);
  const [f, setF] = useState({ ke_pengguna_id: '', dari_pengguna_id: '', mulai: '', selesai: '', alasan: '' });
  const [galat, setGalat] = useState(null);

  const darurat = p.peran === 'super_admin';
  const simpan = async () => {
    setGalat(null);
    try {
      await api.post(darurat ? '/delegasi/darurat' : '/delegasi', f);
      setBuka(false); muatUlang();
    } catch (e) { setGalat(e.message); }
  };

  return (
    <Shell judul="Delegasi"
      aksi={<button className="btn primary" onClick={() => setBuka(true)}>
        {darurat ? 'Tunjuk pengganti' : 'Delegasikan tugas saya'}</button>}
      anak={
        <>
          <section className="card">
            <p className="sub">Tidak ada eskalasi otomatis — delegasi berjangka adalah satu-satunya mekanisme saat approver
              berhalangan. Arahnya ke atas: Atasan 1 ke Atasan 2, Atasan 2 ke Atasan 3. Setiap tindakan lewat delegasi
              tercatat dengan dua nama, dan itulah yang membedakannya dari berbagi akun.</p>
          </section>
          <section className="card">
            <div className="chead"><h3>Daftar delegasi</h3></div>
            {muat ? <Memuat /> : !data?.length ? <Kosong teks="Belum ada delegasi." /> : (
              <table><thead><tr><th>Dari</th><th>Kepada</th><th>Periode</th><th>Alasan</th><th className="ka">Status</th><th /></tr></thead>
                <tbody>{data.map((x) => (
                  <tr key={x.id}>
                    <td><b>{x.dari_nama}</b><div className="sub">{PERAN[x.dari_peran]}</div></td>
                    <td><b>{x.ke_nama}</b><div className="sub">{PERAN[x.ke_peran]}</div></td>
                    <td>{tgl(x.mulai)} – {tgl(x.selesai)}</td>
                    <td className="sub">{x.alasan}</td>
                    <td className="ka"><span className={`chip ${x.dibatalkan_pada ? 'abu' : x.sedang_aktif ? 'ok' : 'info'}`}>
                      {x.dibatalkan_pada ? 'dibatalkan' : x.sedang_aktif ? 'aktif' : 'terjadwal'}</span></td>
                    <td className="ka">{!x.dibatalkan_pada && (darurat || Number(x.dari_pengguna_id) === Number(p.id)) &&
                      <button className="btn ghost kecil" onClick={() => api.hapus(`/delegasi/${x.id}`).then(muatUlang)}>Batalkan</button>}</td>
                  </tr>
                ))}</tbody></table>
            )}
          </section>

          {buka && (
            <Modal tutup={() => setBuka(false)} judul={darurat ? 'Tunjuk pengganti sementara' : 'Delegasikan tugas'}
              catatan={darurat
                ? 'Untuk kasus berhalangan mendadak yang tidak sempat diatur sendiri. Ini bukan hak menyetujui — Anda hanya memindahkan antrean.'
                : 'Antrean Anda akan tampil di layar penerima selama rentang tanggalnya, ditandai atas nama Anda.'}
              anak={<>
                <Pesan anak={galat} />
                {darurat && (
                  <label className="f"><span>Pengguna yang berhalangan</span>
                    <select value={f.dari_pengguna_id} onChange={(e) => setF({ ...f, dari_pengguna_id: e.target.value })}>
                      <option value="">Pilih…</option>
                      {(pengguna.data ?? []).filter((u) => u.peran !== 'super_admin' && u.aktif)
                        .map((u) => <option key={u.id} value={u.id}>{u.nama} — {PERAN[u.peran]}</option>)}
                    </select></label>
                )}
                <label className="f"><span>Penerima delegasi</span>
                  <select value={f.ke_pengguna_id} onChange={(e) => setF({ ...f, ke_pengguna_id: e.target.value })}>
                    <option value="">Pilih…</option>
                    {(pengguna.data ?? []).filter((u) => u.peran !== 'super_admin' && u.aktif && Number(u.id) !== Number(p.id))
                      .map((u) => <option key={u.id} value={u.id}>{u.nama} — {PERAN[u.peran]}</option>)}
                  </select></label>
                <div className="baris dua">
                  <label className="f"><span>Mulai</span>
                    <input type="date" value={f.mulai} onChange={(e) => setF({ ...f, mulai: e.target.value })} /></label>
                  <label className="f"><span>Selesai</span>
                    <input type="date" value={f.selesai} onChange={(e) => setF({ ...f, selesai: e.target.value })} /></label>
                </div>
                <label className="f"><span>Alasan</span>
                  <input value={f.alasan} onChange={(e) => setF({ ...f, alasan: e.target.value })} placeholder="Cuti tahunan" /></label>
              </>}
              aksi={<><button className="btn ghost" onClick={() => setBuka(false)}>Batal</button>
                <button className="btn primary" onClick={simpan}>Simpan</button></>} />
          )}
        </>
      } />
  );
}

export function Notifikasi() {
  const { data, muat, muatUlang } = usePanggil(() => api.get('/notifikasi'), []);
  return (
    <Shell judul="Notifikasi"
      aksi={<button className="btn ghost" onClick={() => api.post('/notifikasi/baca', {}).then(muatUlang)}>
        Tandai semua dibaca</button>}
      anak={
        <section className="card">
          {muat ? <Memuat /> : !data?.notifikasi.length ? <Kosong teks="Belum ada notifikasi." /> : (
            <table><tbody>{data.notifikasi.map((n) => (
              <tr key={n.id}>
                <td style={{ width: 8 }}>{!n.dibaca_pada && <i className="sd" style={{ background: 'var(--blue)' }} />}</td>
                <td><b>{n.judul}</b>{n.isi && <div className="sub">{n.isi}</div>}</td>
                <td className="ka sub">{new Date(n.dibuat_pada).toLocaleString('id-ID')}</td>
              </tr>
            ))}</tbody></table>
          )}
        </section>
      } />
  );
}
