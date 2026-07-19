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
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD npx prisma migrate deploy && node dist/main
