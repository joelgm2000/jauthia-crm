# syntax=docker/dockerfile:1
# ---------- Compilación ----------
# Debian (glibc): los binarios nativos de Angular/esbuild funcionan igual en x86 y en ARM (Oracle Ampere).
FROM node:22-bookworm-slim AS build
WORKDIR /src
# Primero SOLO las dependencias: esta capa queda en caché y no se reinstala mientras
# no cambien los package.json (antes "shared" iba aquí y obligaba a reinstalar todo en cada cambio).
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/
RUN --mount=type=cache,target=/root/.npm \
    npm --prefix frontend ci --prefer-offline --no-audit --no-fund \
 && npm --prefix backend ci --prefer-offline --no-audit --no-fund
COPY shared ./shared
COPY frontend ./frontend
COPY backend ./backend
# La caché de Angular se guarda entre compilaciones: solo recompila lo que cambió.
RUN --mount=type=cache,target=/src/frontend/.angular/cache \
    npm --prefix frontend run build && npm --prefix backend run build \
 && npm --prefix backend prune --omit=dev

# ---------- Ejecución ----------
# Imagen mínima: el backend solo usa dependencias en JavaScript puro.
FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 FRONTEND_DIR=/app/web PRODUCTS_DIR=/app/web/products
WORKDIR /app
COPY --from=build /src/backend/lib ./lib
COPY --from=build /src/backend/node_modules ./node_modules
COPY --from=build /src/backend/package.json ./package.json
COPY --from=build /src/backend/widget ./widget
COPY --from=build /src/frontend/dist/jauthia-crm/browser ./web
# Carpeta de fotos y videos (el volumen hereda el dueño "node").
RUN mkdir -p /app/media && chown node:node /app/media
# Usuario sin privilegios (no root) dentro del contenedor.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "lib/backend/src/server.js"]
