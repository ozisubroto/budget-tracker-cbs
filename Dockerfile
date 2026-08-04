# Tahap 1: membangun antarmuka React.
FROM node:20-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Tahap 2: server. Hanya hasil build yang ikut, bukan seluruh toolchain frontend.
FROM node:20-alpine
WORKDIR /app

# su-exec dipakai skrip masuk untuk menurunkan hak dari root ke node setelah
# kepemilikan volume dibetulkan.
RUN apk add --no-cache su-exec

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY db ./db
COPY masuk.sh ./masuk.sh
COPY --from=web /web/dist ./web/dist

RUN chmod +x ./masuk.sh

ENV NODE_ENV=production
EXPOSE 3000

# Kontainer mulai sebagai root hanya untuk membetulkan kepemilikan volume;
# aplikasinya sendiri dijalankan sebagai node oleh skrip masuk.
ENTRYPOINT ["./masuk.sh"]
CMD ["npm", "start"]
