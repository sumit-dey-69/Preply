#!/bin/sh
# Preply — container entrypoint.
# Runs the Socket.IO sync service and the Next.js server in ONE container.
set -e

echo "[entrypoint] applying database schema..."
# In Docker we use PostgreSQL (provider swapped to postgresql in Dockerfile).
# Use npx (node), not bunx, since the container is node:20-slim.
npx prisma db push --accept-data-loss

echo "[entrypoint] starting sync service (Socket.IO, port 3002)..."
cd /app/mini-services/livepdf-sync
bun run index.ts &
SYNC_PID=$!
cd /app

echo "[entrypoint] starting Next.js (port 3000)..."
exec node server.js
