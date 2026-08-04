#!/bin/sh
set -e

# Volume Railway dipasang dengan pemilik root, sementara aplikasi berjalan
# sebagai pengguna node. Tanpa pembetulan ini, unggahan lampiran ditolak dengan
# EACCES - dan galatnya muncul sebagai "kesalahan server" yang tidak menjelaskan
# apa-apa.
#
# Kepemilikan dibetulkan sebagai root, lalu hak diturunkan ke node sebelum
# aplikasi dijalankan. Proses aplikasi sendiri tidak pernah berjalan sebagai root.
DIR="${LAMPIRAN_DIR:-/data/lampiran}"
if mkdir -p "$DIR" 2>/dev/null; then
  chown -R node:node "$DIR" 2>/dev/null || true
else
  echo "Peringatan: $DIR tidak dapat dibuat. Lampiran tidak akan tersimpan." >&2
fi

exec su-exec node "$@"
