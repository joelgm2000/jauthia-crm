# ---------- Compilación ----------
# Debian (glibc): los binarios nativos de Angular/esbuild funcionan igual en x86 y en ARM (Oracle Ampere).
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY shared ./shared
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/
RUN npm --prefix frontend ci && npm --prefix backend ci
COPY frontend ./frontend
COPY backend ./backend
RUN npm --prefix frontend run build && npm --prefix backend run build \
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
