# --- Etapa 1: compilación (cliente React + dependencias nativas) ---
FROM node:22-bookworm-slim AS build

WORKDIR /app

# better-sqlite3 puede necesitar compilar si no hay prebuild para la plataforma
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci --include=dev

COPY . .
RUN npm run build && npm prune --omit=dev

# --- Etapa 2: runtime mínimo ---
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/data

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist

RUN mkdir -p /data && chown -R node:node /data /app
USER node

VOLUME ["/data"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
