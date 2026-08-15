#!/bin/sh
# Preply — container entrypoint.
# Runs the Socket.IO sync service and the Next.js server in ONE container.
# Database tables are created here (at runtime, where DATABASE_URL is available).
set -e

echo "[entrypoint] applying database schema..."
npx prisma db push --accept-data-loss || echo "[entrypoint] WARNING: db push failed, continuing anyway..."

echo "[entrypoint] starting sync service (Socket.IO, port 3002)..."
cd /app/mini-services/livepdf-sync
bun run index.ts &
SYNC_PID=$!
cd /app

echo "[entrypoint] starting Next.js (port 3000)..."
exec node server.js
