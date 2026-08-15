# LivePDF Room — Local Setup Guide

A complete guide to run **LivePDF Room** on your local PC. Two options are
provided: a **quick local dev setup** (SQLite, two terminals) and a **Docker
production setup** (PostgreSQL, one command).

---

## What you'll get

- A real-time collaborative PDF study room at `http://localhost:3000`
- Create a room → get a 6-character code → share it → others join
- Synchronized PDF viewing (page, scroll, zoom, rotation)
- Shared stopwatch + countdown timer
- Live chat, question markers, annotations (draw/highlight), shared notes
- Presenter mode, room password lock, participant management

---

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| **Node.js** | 18+ (20+ recommended) | Runs the Next.js app |
| **npm** or **bun** | npm 9+ / bun 1+ | Package manager |
| **Git** | any | To clone the project |

> You do **not** need PostgreSQL or Redis for local dev — the app uses a
> local SQLite file. PostgreSQL is only needed for the Docker deployment.

---

## Option A — Quick Local Dev Setup (SQLite)

This runs everything on your machine with a local SQLite database. Best for
trying it out and development.

### Step 1 — Get the code

```bash
git clone <your-repo-url> livepdf-room
cd livepdf-room
```

### Step 2 — Install dependencies

```bash
npm install
```

> Or with bun: `bun install`

### Step 3 — Configure environment

```bash
cp .env.example .env
```

This creates a `.env` file with `DATABASE_URL=file:./db/custom.db` (SQLite).
No changes needed for local dev.

### Step 4 — Set up the database

```bash
npm run db:push
```

This creates the SQLite database file at `db/custom.db` with all the tables
(rooms, PDFs, participants, chat, markers, notes, annotations).

### Step 5 — Copy the PDF worker

The PDF viewer (react-pdf) needs the pdf.js worker. Copy it into `public/`:

```bash
# The worker ships inside react-pdf's dependencies:
cp node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
```

> If that path doesn't exist (react-pdf version differences), try:
> `cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs`

### Step 6 — Start the Socket.IO sync service (Terminal 1)

The real-time features (sync, chat, timer, presence) run on a separate
Socket.IO server. Open your **first terminal**:

```bash
cd mini-services/livepdf-sync
npm install          # only needed the first time
npm run dev
```

You should see:
```
[livepdf-sync] Socket.IO server running on port 3002
```

**Keep this terminal running.** The sync service listens on port `3002`.

### Step 7 — Start the Next.js app (Terminal 2)

Open your **second terminal**:

```bash
npm run dev
```

You should see:
```
▲ Next.js 16.1.3 (Turbopack)
- Local: http://localhost:3000
✓ Ready
```

### Step 8 — Open the app

Open your browser to **http://localhost:3000**

That's it! You can now:
1. Enter your name → click **Create room**
2. Get a room code (e.g. `A7K9P2`)
3. Open a **second browser tab** (or incognito) to `http://localhost:3000`
4. Enter the same code with a different name → **Join room**
5. Upload a PDF → it opens for both users
6. Scroll/zoom/page-change → synced in real time

---

## Option B — Docker Setup (PostgreSQL, production-like)

This runs the app + PostgreSQL in Docker containers with one command.
Best for a real deployment or testing the production setup.

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) 20+
- [Docker Compose](https://docs.docker.com/compose/install/) v2+

### Step 1 — Get the code & configure

```bash
git clone <your-repo-url> livepdf-room
cd livepdf-room
cp .env.example .env
```

Edit `.env` to use PostgreSQL:
```env
DATABASE_URL=postgresql://livepdf:livepdf@postgres:5432/livepdf?schema=public
POSTGRES_USER=livepdf
POSTGRES_PASSWORD=livepdf
POSTGRES_DB=livepdf
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 2 — Start everything

```bash
docker compose up --build
```

This will:
1. Build the app container (Next.js + API + Socket.IO in **one** container)
2. Start a PostgreSQL container
3. Run database migrations automatically
4. Serve the app on port `3000`

Wait for the build (first time ~2-3 min), then open **http://localhost:3000**.

### Step 3 — Stop / restart

```bash
# Stop (keeps data in volumes)
docker compose down

# Stop + delete all data (fresh start)
docker compose down -v
```

---

## How to test the real-time sync

LivePDF Room is designed for **two or more participants**. To test it locally:

1. Open `http://localhost:3000` in **Browser Tab A** (e.g. Chrome)
2. Enter name "Alice" → **Create room** → note the room code
3. Open `http://localhost:3000` in **Browser Tab B** (e.g. incognito or Firefox)
4. Enter the room code + name "Bob" → **Join room**
5. In Tab A: upload a PDF → it appears instantly in Tab B
6. In Tab A: scroll, zoom, change page → Tab B follows
7. In Tab A: start the stopwatch → both see the same ticking time
8. In Tab B: draw an annotation → Tab A sees it live
9. In either: send a chat message → the other receives it

> **Tip:** Use two different browsers (Chrome + Firefox) or one normal +
> one incognito window so the localStorage session IDs don't conflict.

---

## Project structure (what runs where)

```
livepdf-room/
├── src/                          # Next.js app (frontend + API)
│   ├── app/                      # App Router pages + API routes
│   ├── components/livepdf/       # All room UI components
│   └── lib/                      # Shared utilities, types, socket client
├── mini-services/
│   └── livepdf-sync/             # Socket.IO sync server (port 3002)
│       ├── index.ts              # Real-time handlers (sync, timer, chat)
│       └── package.json
├── prisma/
│   └── schema.prisma             # Database models
├── public/
│   └── pdf.worker.min.mjs         # pdf.js worker (copy in Step 5)
├── storage/pdfs/                 # Uploaded PDFs (local file storage)
├── Dockerfile                    # Single app container (Docker option)
├── docker-compose.yml             # app + PostgreSQL (Docker option)
├── .env.example                   # Environment template
└── package.json
```

### Two processes, one app

| Process | Port | Role |
|---------|------|------|
| Next.js | `3000` | Web UI + REST API + PDF file serving |
| Socket.IO sync | `3002` | Real-time sync (page/scroll/zoom, chat, timer, presence) |

The browser loads the page from port `3000`, then connects a WebSocket to
port `3002` for real-time updates. The socket client auto-detects whether
it's behind a gateway (sandbox) or running locally (direct to port 3002).

---

## Common issues & fixes

### "Could not find the pdf.worker"
You skipped **Step 5** (copy the PDF worker). Run:
```bash
cp node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
```

### "API version does not match the Worker version"
You copied the wrong worker version. The worker must match react-pdf's bundled
pdfjs-dist. Use the path from Step 5 (inside `react-pdf/node_modules/`).

### Real-time sync doesn't work (page/scroll not syncing)
The Socket.IO sync service (port 3002) isn't running. Check **Terminal 1**
shows `[livepdf-sync] Socket.IO server running on port 3002`. If not,
restart it: `cd mini-services/livepdf-sync && npm run dev`.

### "PrismaClientInitializationError" or "db not found"
You skipped **Step 4**. Run `npm run db:push` to create the database.

### Port already in use
- Port 3000 in use → another dev server is running. Kill it or change the
  port in `package.json` (`"dev": "next dev -p 3001 ..."`).
- Port 3002 in use → another sync service is running. Kill it or change
  `SYNC_SOCKET_PORT` in `src/lib/constants.ts`.

### Changes not showing up
The dev server uses hot-reload, but sometimes a full restart helps:
- Stop both terminals (Ctrl+C)
- Restart the sync service (Terminal 1), then the dev server (Terminal 2)

---

## Environment variables reference

| Variable | Local dev | Docker | Purpose |
|----------|-----------|--------|---------|
| `DATABASE_URL` | `file:./db/custom.db` | `postgresql://...@postgres:5432/...` | Database connection |
| `PORT` | `3000` | `3000` | Next.js port |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `http://localhost:3000` | Public app URL |
| `POSTGRES_USER` | (not used) | `livepdf` | Postgres container user |
| `POSTGRES_PASSWORD` | (not used) | `livepdf` | Postgres container password |
| `POSTGRES_DB` | (not used) | `livepdf` | Postgres database name |

---

## Quick command reference

```bash
# Local dev (run in two terminals)
npm install                          # install app deps
npm run db:push                      # create SQLite database
cd mini-services/livepdf-sync && npm install && npm run dev   # Terminal 1: sync service
npm run dev                          # Terminal 2: Next.js app

# Docker (one command)
cp .env.example .env                 # then edit .env for PostgreSQL
docker compose up --build            # builds + starts app + postgres

# Utilities
npm run lint                         # check code quality
npm run db:generate                  # regenerate Prisma client after schema changes
npm run db:reset                     # ⚠️ wipe + recreate the database
```

---

## Next steps

- **Share your room:** Use the "Invite" button in the room header to copy the
  shareable link. Others on your network can join (use your LAN IP instead of
  `localhost`).
- **Upload PDFs:** Only PDF files are accepted (max 25 MB). Filenames are
  sanitized and stored with random names for security.
- **Explore features:** Try the annotation toolbar (Pencil icon), search
  (Ctrl+F), question markers (Bookmark), shared notes, and the activity feed.
- **Keyboard shortcuts:** Click the keyboard icon in the room header to see
  all shortcuts (Ctrl+F search, Ctrl+Z undo, arrow keys for pages, etc.).

Enjoy your collaborative study sessions! 📚
