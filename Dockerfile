# ---------- STAGE 1: build & dependencies ----------
FROM node:22-alpine AS build
WORKDIR /app
# install semua dep (termasuk dev: typescript, tsx) untuk compile
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ---------- STAGE 2: runtime (ramping, tanpa tsx/typescript) ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# hanya runtime dependencies (discord.js)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# hasil compile JS (sudah include oauth.js di dist)
COPY --from=build /app/dist ./dist

# volume token OAuth ChatGPT biar login persisten
VOLUME ["/root/.config/bangjago"]
EXPOSE 1455

CMD ["node", "dist/index.js"]