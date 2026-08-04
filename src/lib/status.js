/**
 * Mesin status pengajuan.
 *
 * Sebelas status, dan tidak ada perpindahan yang boleh terjadi di luar tabel ini.
 * Menaruh aturannya di satu tempat membuat pertanyaan "siapa boleh apa, kapan"
 * punya satu jawaban yang bisa diperiksa - bukan tersebar di banyak handler.
 */

export const PEMEGANG = {
  menunggu_atasan_1: 'atasan_1',
  menunggu_atasan_2: 'atasan_2',
  menunggu_atasan_3: 'atasan_3',
  menunggu_finance: 'finance',
};

export const SEDANG_APPROVAL = Object.keys(PEMEGANG);

/**
 * Rute setelah Atasan 2 menyetujui.
 *
 * Dua syarat harus terpenuhi bersamaan agar boleh lompat ke Finance. Cek pagu
 * didahulukan: melebihi anggaran lebih berat daripada sekadar nominal besar,
 * sehingga pengajuan dua juta yang membuat region jebol tetap harus dilihat
 * Atasan 3.
 */
export function rutaSetelahAtasan2({ melebihi_pagu, total_nominal, batas_pagu }) {
  if (melebihi_pagu) return { status: 'menunggu_atasan_3', jalurCepat: false, sebab: 'melebihi pagu region' };
  if (Number(total_nominal) > Number(batas_pagu))
    return { status: 'menunggu_atasan_3', jalurCepat: false, sebab: 'di atas batas pagu Atasan 2' };
  return { status: 'menunggu_finance', jalurCepat: true, sebab: 'dalam batas pagu dan pagu region cukup' };
}

/** Status berikutnya untuk aksi approve pada tahap tertentu. */
export function setelahApprove(status, konteks) {
  switch (status) {
    case 'menunggu_atasan_1': return { status: 'menunggu_atasan_2' };
    case 'menunggu_atasan_2': return rutaSetelahAtasan2(konteks);
    case 'menunggu_atasan_3': return { status: 'menunggu_finance' };
    case 'menunggu_finance':  return { status: 'menunggu_realisasi' };
    default: return null;
  }
}
