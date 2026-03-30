# ── Stage 1: Build backend ────────────────────────────────────────────────────
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Force development so devDeps (typescript, etc.) are installed
ENV NODE_ENV=development

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ src/

RUN npm run build

# ── Stage 2: Build dashboard ──────────────────────────────────────────────────
FROM node:20-alpine AS dashboard-builder

WORKDIR /app/dashboard

# Force development so devDeps (vite, etc.) are installed
ENV NODE_ENV=development

COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci

COPY dashboard/ ./

# Point API to same origin (served by Express)
ENV VITE_API_BASE=/api
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

# Production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Backend build
COPY --from=backend-builder /app/dist/ dist/

# Dashboard build → served as static files by Express
COPY --from=dashboard-builder /app/dashboard/dist/ dashboard/dist/

ENV NODE_ENV=production
ENV PORT=4400

EXPOSE 4400

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:4400/api/health || exit 1

USER node

CMD ["node", "dist/index.js"]
