# ── Build stage ──
FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Production stage ──
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Don't run as root
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Readiness: the app answers AND the database does
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
