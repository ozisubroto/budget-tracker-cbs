/** Satu pintu ke API. Token disimpan di memori dan localStorage. */
let token = localStorage.getItem('bt_token') || null;
let pengguna = JSON.parse(localStorage.getItem('bt_pengguna') || 'null');

export const sesi = {
  get token() { return token; },
  get pengguna() { return pengguna; },
  simpan(t, p) {
    token = t; pengguna = p;
    localStorage.setItem('bt_token', t);
    localStorage.setItem('bt_pengguna', JSON.stringify(p));
  },
  hapus() { token = null; pengguna = null; localStorage.clear(); },
};

export class GalatApi extends Error {
  constructor(pesan, status, data) { super(pesan); this.status = status; this.data = data; }
}

async function panggil(metode, jalur, badan, opsi = {}) {
  const r = await fetch(`/api${jalur}`, {
    method: metode,
    headers: {
      ...(badan instanceof FormData ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: badan instanceof FormData ? badan : badan ? JSON.stringify(badan) : undefined,
  });
  if (r.status === 401) { sesi.hapus(); location.href = '/masuk'; throw new GalatApi('Sesi berakhir', 401); }
  if (opsi.berkas) {
    if (!r.ok) throw new GalatApi('Gagal mengunduh', r.status);
    return r.blob();
  }
  const data = await r.json().catch(() => ({}));
  // Pesan galat dari server sudah ditulis untuk dibaca pengguna, jadi diteruskan
  // apa adanya - bukan diganti kalimat generik yang menyembunyikan sebabnya.
  if (!r.ok) throw new GalatApi(data.pesan || 'Terjadi kesalahan.', r.status, data);
  return data;
}

export const api = {
  get: (j, o) => panggil('GET', j, null, o),
  post: (j, b) => panggil('POST', j, b),
  put: (j, b) => panggil('PUT', j, b),
  patch: (j, b) => panggil('PATCH', j, b),
  hapus: (j) => panggil('DELETE', j),
};

/**
 * Mengambil berkas dari API.
 *
 * Tautan <a href> biasa tidak membawa header autentikasi, sehingga server
 * menolaknya. Berkas harus diambil lewat fetch yang membawa token, lalu
 * ditampilkan atau diunduh dari memori.
 */
export async function ambilBerkas(jalur) {
  const blob = await api.get(jalur, { berkas: true });
  return { blob, url: URL.createObjectURL(blob) };
}

/** Mengunduh berkas dengan nama yang benar. */
export async function unduhBerkas(jalur, nama) {
  const { url } = await ambilBerkas(jalur);
  const a = document.createElement('a');
  a.href = url; a.download = nama;
  document.body.appendChild(a); a.click(); a.remove();
  // Ditunda sedikit: sebagian peramban membatalkan unduhan bila URL dicabut
  // terlalu cepat.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Membuka surat cetak di tab baru. */
export async function bukaSurat(jalur) {
  const { url } = await ambilBerkas(jalur);
  const jendela = window.open(url, '_blank');
  if (!jendela) {
    // Peramban memblokir pop-up. Unduh sebagai berkas supaya penggunanya
    // tetap dapat suratnya, bukan sekadar galat tanpa jalan keluar.
    const a = document.createElement('a');
    a.href = url; a.download = 'surat-pengajuan.html';
    document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const bisaPratinjau = (nama = '') => /\.(pdf|jpe?g|png|webp)$/i.test(nama);

export const rp = (n) => (n === null || n === undefined ? '—' : 'Rp ' + Math.round(Number(n)).toLocaleString('id-ID'));
export const rpSingkat = (n) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e9) return `Rp ${(v / 1e9).toFixed(2)} M`;
  if (Math.abs(v) >= 1e6) return `Rp ${(v / 1e6).toFixed(1)} jt`;
  return rp(v);
};
export const persen = (n) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(1)}%`);
export const tgl = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const NAMA_BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export const STATUS = {
  draft:              { teks: 'Draft',               warna: 'var(--faint)' },
  menunggu_atasan_1:  { teks: 'Menunggu Atasan 1',   warna: 'var(--amber)' },
  menunggu_atasan_2:  { teks: 'Menunggu Atasan 2',   warna: 'var(--amber)' },
  menunggu_atasan_3:  { teks: 'Menunggu Atasan 3',   warna: 'var(--amber)' },
  menunggu_finance:   { teks: 'Menunggu Finance',    warna: 'var(--blue)' },
  menunggu_realisasi: { teks: 'Menunggu realisasi',  warna: 'var(--violet)' },
  realisasi_sebagian: { teks: 'Realisasi sebagian',  warna: 'var(--violet)' },
  selesai:            { teks: 'Selesai',             warna: 'var(--green)' },
  perlu_revisi:       { teks: 'Perlu revisi',        warna: 'var(--red)' },
  ditolak:            { teks: 'Ditolak',             warna: 'var(--red)' },
  dibatalkan:         { teks: 'Dibatalkan',          warna: 'var(--faint)' },
};

export const PERAN = {
  admin: 'Admin', atasan_1: 'Atasan 1', atasan_2: 'Atasan 2',
  atasan_3: 'Atasan 3', finance: 'Finance', super_admin: 'Super Admin',
};
