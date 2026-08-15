# Preply — Deployment & Hosting Guide

Complete guide to host Preply on **Vercel**, a **local machine**, or a **VPS/Docker**.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Option A — Local Machine (Dev / Self-Hosted)](#option-a--local-machine-dev--self-hosted)
3. [Option B — Vercel + Railway (Cloud, Free Tier)](#option-b--vercel--railway-cloud-free-tier)
4. [Option C — Docker / VPS (Full Self-Hosted)](#option-c--docker--vps-full-self-hosted)
5. [Post-Deploy Checklist](#5-post-deploy-checklist)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Architecture Overview

Preply has **3 components** that must all be running:

```
┌─────────────────────────────────────────────────┐
│                    Browser                       │
│              (User A + User B)                    │
└──────────┬──────────────────────┬───────────────┘
           │ HTTP                  │ WebSocket
           ▼                       ▼
   ┌──────────────┐        ┌──────────────────┐
   │  Next.js App │        │  Socket.IO Sync  │
   │  (port 3000) │        │   Service        │
   │              │        │  (port 3002)      │
   │ • Web UI     │        │ • Real-time sync │
   │ • REST API   │        │ • Timer state     │
   │ • PDF serving │        │ • Presence       │
   └──────┬───────┘        └──────────────────┘
          │ Prisma
          ▼
   ┌──────────────┐
   │  Database    │
   │ (PostgreSQL  │
   │  or SQLite)  │
   └──────────────┘
```

| Component | Role | Port |
|-----------|------|------|
| **Next.js** | Web UI + REST API + PDF file serving | 3000 |
| **Socket.IO Sync** | Real-time sync (page, scroll, zoom, chat, timer) | 3002 |
| **Database** | Rooms, PDFs, chat, markers, notes, annotations | 5432 (PG) / file (SQLite) |

> ⚠️ **Vercel limitation:** Vercel runs serverless functions that can't
> maintain persistent WebSocket connections. The Socket.IO sync service
> **must** run on a separate long-running host (Railway, Render, Fly.io, or
> your own VPS). The Next.js app goes on Vercel, the sync service goes
> elsewhere.

---

## Option A — Local Machine (Dev / Self-Hosted)

Best for: development, testing, or running on your own computer/LAN.

### Prerequisites

- **Node.js 18+** (20+ recommended) — [download](https://nodejs.org/)
- **npm** or **bun** — package manager
- **Git** — to clone the repo

### Step 1: Clone & install

```bash
git clone <your-repo-url> livepdf-room
cd livepdf-room
npm install
```

### Step 2: Configure environment

```bash
cp .env.example .env
```

The default `.env` uses SQLite (no PostgreSQL needed):
```env
DATABASE_URL=file:./db/custom.db
```

### Step 3: Create the database

```bash
npm run db:push
```

You should see:
```
🚀 Your database is now in sync with your Prisma schema.
```

### Step 4: Copy the PDF worker

```bash
cp node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
```

> If that path doesn't exist, try:
> `cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs`

### Step 5: Set the sync service URL

Add this to your `.env` so the frontend knows where the Socket.IO server is:

```env
NEXT_PUBLIC_SYNC_URL=http://localhost:3002
```

### Step 6: Start the Socket.IO sync service (Terminal 1)

```bash
cd mini-services/livepdf-sync
npm install
npm run dev
```

You should see:
```
[livepdf-sync] Socket.IO server running on port 3002
```

**Keep this terminal open.**

### Step 7: Start the Next.js app (Terminal 2)

```bash
cd /path/to/livepdf-room
npm run dev
```

You should see:
```
▲ Next.js 16.1.3
- Local: http://localhost:3000
✓ Ready
```

### Step 8: Open the app

Go to **http://localhost:3000** in your browser.

### Step 9: Test real-time sync

1. Open `http://localhost:3000` in **Tab A** → enter name → **Create room**
2. Open `http://localhost:3000` in **Tab B** (incognito) → enter room code → **Join**
3. Upload a PDF → it opens for both
4. Scroll / zoom / change page → synced in real time

### Access from other devices on your LAN

If you want other people on your WiFi to access the app:

1. Find your local IP: `ip addr` (Linux) or `ipconfig` (Windows)
   - e.g. `192.168.1.100`
2. Start the sync service with:
   ```bash
   cd mini-services/livepdf-sync
   bun run index.ts  # or: node --loader tsx index.ts
   ```
3. In `.env`, set:
   ```env
   NEXT_PUBLIC_SYNC_URL=http://192.168.1.100:3002
   ```
4. Start Next.js:
   ```bash
   npm run dev -- -H 0.0.0.0
   ```
5. Others access `http://192.168.1.100:3000`

---

## Option B — Vercel + Railway (Cloud, Free Tier)

Best for: public deployment with free hosting. Next.js goes on Vercel,
the Socket.IO sync service goes on Railway (or Render / Fly.io),
PostgreSQL goes on Railway or Neon.

### Architecture

```
Vercel (Next.js)  ──→  Railway (Socket.IO sync, port 3002)
       │                        │
       │                        ▼
       │                 Railway/Neon (PostgreSQL)
       │
       ▼
  Vercel Blob / S3 (PDF storage)  ← optional, see note below
```

### Part 1: Database (Neon — free PostgreSQL)

1. Go to [neon.tech](https://neon.tech) → sign up (free)
2. Create a new project → copy the connection string
3. It looks like:
   ```
   postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require
   ```

### Part 2: Socket.IO Sync Service (Railway — free tier)

1. Go to [railway.app](https://railway.app) → sign up with GitHub
2. **New Project → Deploy from GitHub repo**
3. Set the **root directory** to `mini-services/livepdf-sync`
4. Railway will detect it's a Node/Bun project
5. Set environment variables:
   ```
   PORT=3002
   ```
6. Add a `Dockerfile` in `mini-services/livepdf-sync/` (Railway supports Docker):

   ```dockerfile
   FROM oven/bun:1
   WORKDIR /app
   COPY package.json .
   RUN bun install
   COPY . .
   # Copy the shared lib types (from the parent project)
   EXPOSE 3002
   CMD ["bun", "run", "index.ts"]
   ```

   > **Important:** The sync service imports from `../../src/lib/types.js`.
   > On Railway you'll need to either:
   > - Include `src/lib/` in the sync service's deploy context, OR
   > - Copy the types into the sync service folder, OR
   > - Deploy the **entire repo** as the Railway project and set
   >   the start command to `cd mini-services/livepdf-sync && bun run index.ts`

7. Deploy → Railway gives you a URL like:
   ```
   https://livepdf-sync-production.up.railway.app
   ```

8. **Verify:** open that URL in a browser → you should see:
   ```json
   {"service":"livepdf-sync","ok":true,"rooms":0}
   ```

### Part 3: Next.js App (Vercel)

1. Go to [vercel.com](https://vercel.com) → sign up with GitHub
2. **Import** your GitHub repo
3. Configure:
   - **Framework Preset:** Next.js
   - **Root Directory:** `./` (the repo root)
   - **Build Command:** `npm run build`
   - **Output:** (leave default — Vercel auto-detects Next.js standalone)

4. Set **Environment Variables**:
   ```
   DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
   NEXT_PUBLIC_SYNC_URL=https://livepdf-sync-production.up.railway.app
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   ```

5. **Deploy** → wait for the build to finish

6. Vercel gives you: `https://your-app.vercel.app`

### Part 4: Run database migration

After the first deploy, run Prisma against the production database:

```bash
# Set DATABASE_URL to your Neon connection string
export DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require"
npx prisma db push
```

### Part 5: PDF Storage (important!)

Vercel's serverless filesystem is **ephemeral** — uploaded PDFs disappear
after the function ends. You need persistent storage:

#### Option 1: Vercel Blob (easiest)
1. In Vercel dashboard → **Storage → Create Blob Store**
2. Add the Blob read/write token to env vars
3. Update `src/lib/pdf-storage.ts` to use Vercel Blob instead of local files

#### Option 2: Cloudflare R2 / AWS S3
1. Create an R2 bucket or S3 bucket
2. Add credentials to env vars
3. Update the upload API to stream to S3/R2 instead of local disk

#### Option 3: Keep PDFs on Railway
Run the sync service on Railway with a persistent volume, and serve
PDFs from there instead of Vercel.

> For a quick MVP, you can skip this and PDFs will work during the
> session but disappear on redeploy.

### Part 6: Update the Prisma schema for PostgreSQL

In `prisma/schema.prisma`, change the provider:

```prisma
datasource db {
  provider = "postgresql"    # ← change from "sqlite"
  url      = env("DATABASE_URL")
}
```

### Part 7: Test

1. Open `https://your-app.vercel.app`
2. Create a room → upload a PDF → open a second tab
3. Scroll / zoom / chat → should sync in real time

---

## Option C — Docker / VPS (Full Self-Hosted)

Best for: full control, single server, no external dependencies.

### Prerequisites

- A VPS (DigitalOcean, Hetzner, AWS EC2, etc.) with:
  - **Docker** 20+ installed
  - **Docker Compose** v2+ installed
  - At least **1 GB RAM**

### Step 1: Clone the repo

```bash
ssh root@your-server
git clone <your-repo-url> /opt/livepdf-room
cd /opt/livepdf-room
```

### Step 2: Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL=postgresql://livepdf:livepdf@postgres:5432/livepdf?schema=public
POSTGRES_USER=livepdf
POSTGRES_PASSWORD=change-this-password
POSTGRES_DB=livepdf
PORT=3000
NEXT_PUBLIC_APP_URL=http://your-server-ip:3000
```

> ⚠️ Change the PostgreSQL password to something secure!

### Step 3: Build & start

```bash
docker compose up --build -d
```

This starts:
- **PostgreSQL** container (with persistent volume)
- **App** container (Next.js + Socket.IO sync in one, with persistent PDF storage volume)

Wait ~2-3 minutes for the first build, then:

```bash
docker compose ps
```

Both containers should show `Up`:
```
NAME                STATUS              PORTS
livepdf-app         Up                  0.0.0.0:3000->3000/tcp
livepdf-postgres    Up (healthy)        5432/tcp
```

### Step 4: Access the app

Open `http://your-server-ip:3000` in your browser.

### Step 5: Set up a domain + HTTPS (optional, recommended)

Use **Caddy** as a reverse proxy with automatic HTTPS:

```bash
# Install Caddy
sudo apt install caddy

# Edit Caddyfile
sudo nano /etc/caddy/Caddyfile
```

```caddy
yourdomain.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl restart caddy
```

Now your app is at `https://yourdomain.com` with automatic HTTPS.

### Docker commands reference

```bash
# Start (detached)
docker compose up --build -d

# View logs
docker compose logs -f app

# Stop
docker compose down

# Stop + delete all data (fresh start)
docker compose down -v

# Rebuild after code changes
git pull
docker compose up --build -d
```

---

## 5. Post-Deploy Checklist

After deploying, verify each feature:

| # | Feature | How to test |
|---|---------|-------------|
| 1 | **Room creation** | Enter name → Create room → get a code |
| 2 | **Room join** | Open second tab → enter code → join |
| 3 | **PDF upload** | Click Upload → select a PDF → appears for both |
| 4 | **PDF viewer** | PDF renders with page navigation |
| 5 | **Page sync** | A changes page → B follows |
| 6 | **Scroll sync** | A scrolls → B scrolls |
| 7 | **Zoom** | Ctrl+scroll or zoom buttons → PDF resizes |
| 8 | **Timer** | Start stopwatch → both see same time |
| 9 | **Chat** | Send message → other receives it |
| 10 | **Notes** | Type in shared notes → other sees it |
| 11 | **Annotations** | Draw on PDF → other sees it |
| 12 | **Presence** | Both see each other in People tab |
| 13 | **Connection indicator** | Shows "Live Sync" with latency |
| 14 | **Room recovery** | Refresh page → state restored |

---

## 6. Troubleshooting

### "Real-time sync doesn't work" (page/scroll/chat/timer)

**Cause:** The Socket.IO sync service isn't running or isn't reachable.

**Fix:**
1. Check the sync service is running:
   - Local: Terminal 1 shows `[livepdf-sync] Socket.IO server running on port 3002`
   - Docker: `docker compose logs app` should show the sync service starting
   - Railway: the health check URL returns `{"ok":true}`

2. Check `NEXT_PUBLIC_SYNC_URL` is set correctly:
   - Local: `http://localhost:3002`
   - Vercel: `https://your-sync-service.railway.app`

3. Check the browser console for WebSocket connection errors.

### "PDF doesn't open / blank viewer"

**Cause:** The PDF worker file is missing.

**Fix:**
```bash
cp node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
```

Then restart the dev server.

### "API version does not match the Worker version"

**Cause:** Wrong pdf.js worker version copied.

**Fix:** Use the worker from inside react-pdf's dependencies:
```bash
cp node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
```

### "Prisma schema validation error" / "URL must start with file:"

**Cause:** `DATABASE_URL` is missing or wrong in `.env`.

**Fix (SQLite/local):**
```bash
echo 'DATABASE_URL=file:./db/custom.db' > .env
npm run db:push
```

**Fix (PostgreSQL/Docker):**
```bash
echo 'DATABASE_URL=postgresql://livepdf:livepdf@postgres:5432/livepdf?schema=public' >> .env
```

### "Zoom doesn't work on desktop"

**Cause:** Old code — pull the latest changes.

The zoom supports:
- **Zoom in/out buttons** in the toolbar (always enabled)
- **Ctrl + mouse wheel** (scroll up = zoom in, down = zoom out)
- **Fit to width** button (click the zoom percentage label)

### "Docker build fails with permission denied"

This was a bug in the Dockerfile that's been fixed. Pull the latest:
```bash
git pull
docker compose up --build
```

### "PDFs disappear after redeploy on Vercel"

**Cause:** Vercel's filesystem is ephemeral.

**Fix:** Use Vercel Blob, Cloudflare R2, or AWS S3 for PDF storage.
See [Option B, Part 5](#part-5-pdf-storage-important).

### "Socket.IO connection fails on Railway"

**Cause:** Railway needs the correct port.

**Fix:** Set `PORT=3002` in Railway env vars. Railway auto-detects the port
from the `PORT` env var.

### "CORS errors in browser console"

**Cause:** The sync service and the frontend are on different origins.

**Fix:** The sync service already has `cors: { origin: "*" }`. If you still
see CORS errors, make sure the sync service URL in `NEXT_PUBLIC_SYNC_URL`
matches the actual deployed URL.

---

## Environment Variables Reference

| Variable | Local Dev | Vercel + Railway | Docker |
|----------|-----------|------------------|--------|
| `DATABASE_URL` | `file:./db/custom.db` | `postgresql://...@neon.tech/...` | `postgresql://...@postgres:5432/...` |
| `NEXT_PUBLIC_SYNC_URL` | `http://localhost:3002` | `https://sync.railway.app` | (not needed — same container) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `https://app.vercel.app` | `http://server:3000` |
| `POSTGRES_USER` | — | — | `livepdf` |
| `POSTGRES_PASSWORD` | — | — | `your-password` |
| `POSTGRES_DB` | — | — | `livepdf` |
| `PORT` | 3000 | (auto) | 3000 |

---

## Quick Start Summary

### Fastest (local, 5 minutes):
```bash
git clone <repo> livepdf-room && cd livepdf-room
npm install
cp .env.example .env
echo 'NEXT_PUBLIC_SYNC_URL=http://localhost:3002' >> .env
npm run db:push
cp node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs

# Terminal 1:
cd mini-services/livepdf-sync && npm install && npm run dev

# Terminal 2:
npm run dev
```
→ Open `http://localhost:3000`

### Cloud (Vercel + Railway + Neon, 30 minutes):
1. **Neon:** create PostgreSQL → copy connection string
2. **Railway:** deploy `mini-services/livepdf-sync` → get sync URL
3. **Vercel:** import repo → set env vars → deploy
4. Run `npx prisma db push` with the Neon URL
→ Open your Vercel URL

### Docker (VPS, 10 minutes):
```bash
git clone <repo> && cd livepdf-room
cp .env.example .env  # edit for PostgreSQL
docker compose up --build -d
```
→ Open `http://your-server:3000`

---

Need help? Check the [troubleshooting](#6-troubleshooting) section or open an issue.
