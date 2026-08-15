# ---- Preply — single application container ----
# Contains: Next.js (frontend + API) + Node.js Socket.IO sync service.
# PostgreSQL runs in a separate container (see docker-compose.yml).

# ---- Build stage ----
FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* yarn.lock* package-lock.json* ./
# Install with npm (works everywhere); bun/yarn also fine if available in your CI.
RUN npm install

COPY . .

# Switch Prisma provider to PostgreSQL for the container build (sandbox uses SQLite).
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma

# Generate Prisma client + build Next.js (standalone output).
RUN npx prisma generate
RUN npm run build

# Copy the PDF.js worker into the standalone output's public folder.
RUN cp -f public/pdf.worker.min.mjs .next/standalone/public/pdf.worker.min.mjs 2>/dev/null || true

# ---- Runtime stage ----
FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates curl unzip && rm -rf /var/lib/apt/lists/*

# Install bun (needed to run the TypeScript sync service) — install to /usr/local/bin
RUN curl -fsSL https://bun.sh/install | bash \
    && cp /root/.bun/bin/bun /usr/local/bin/bun \
    && chmod +x /usr/local/bin/bun

# Non-root user
RUN useradd -m -u 1001 livepdf

# Create the PDF storage directory as root (before switching to non-root user)
RUN mkdir -p /app/storage/pdfs && chown -R livepdf:livepdf /app/storage
VOLUME ["/app/storage/pdfs"]

# Switch to non-root user for the runtime
USER livepdf

# Copy standalone Next.js server + public assets
COPY --from=builder --chown=livepdf:livepdf /app/.next/standalone ./
COPY --from=builder --chown=livepdf:livepdf /app/.next/static ./.next/static
COPY --from=builder --chown=livepdf:livepdf /app/public ./public

# Prisma schema + migrations (needed at runtime for migrate deploy)
COPY --from=builder --chown=livepdf:livepdf /app/prisma ./prisma
COPY --from=builder --chown=livepdf:livepdf /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=livepdf:livepdf /app/node_modules/@prisma ./node_modules/@prisma

# Socket.IO sync service source (runs in the same container)
COPY --from=builder --chown=livepdf:livepdf /app/mini-services ./mini-services
COPY --from=builder --chown=livepdf:livepdf /app/src/lib ./src/lib
# socket.io runtime dependency
COPY --from=builder --chown=livepdf:livepdf /app/node_modules/socket.io ./node_modules/socket.io
COPY --from=builder --chown=livepdf:livepdf /app/node_modules/socket.io-parser ./node_modules/socket.io-parser
COPY --from=builder --chown=livepdf:livepdf /app/node_modules/socket.io-adapter ./node_modules/socket.io-adapter
COPY --from=builder --chown=livepdf:livepdf /app/node_modules/@socket.io ./node_modules/@socket.io
COPY --from=builder --chown=livepdf:livepdf /app/node_modules/engine.io ./node_modules/engine.io
COPY --from=builder --chown=livepdf:livepdf /app/node_modules/accepts ./node_modules/accepts
COPY --from=builder --chown=livepdf:livepdf /app/node_modules/cors ./node_modules/cors
COPY --from=builder --chown=livepdf:livepdf /app/node_modules/debug ./node_modules/debug
COPY --from=builder --chown=livepdf:livepdf /app/node_modules/ms ./node_modules/ms
COPY --from=builder --chown=livepdf:livepdf /app/start.sh ./start.sh
RUN chmod +x ./start.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["./start.sh"]
