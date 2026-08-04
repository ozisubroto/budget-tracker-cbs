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

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY db ./db
COPY --from=web /web/dist ./web/dist

USER node
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
