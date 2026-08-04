# Build eksplisit, tanpa bergantung pada deteksi otomatis builder Railway.
FROM node:20-alpine

WORKDIR /app

# Dependensi disalin lebih dulu agar lapisan ini terpakai ulang selama
# package.json tidak berubah - build berikutnya jauh lebih cepat.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY db ./db

# Tidak berjalan sebagai root.
USER node

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
