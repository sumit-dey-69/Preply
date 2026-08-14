# LivePDF Room

A real-time collaborative PDF study room. Two or more students join a shared room (by code or link), upload PDFs, and view the same document with synchronized **page / scroll / zoom / rotation**, a shared **server-authoritative stopwatch & countdown**, live **presence**, and an optional **presenter mode**.

The experience feels like one shared PDF viewer distributed across multiple browsers.

---

## Architecture

```
                     ┌─────────────────┐
                     │     Browser     │
                     │   User A / B    │
                     └────────┬────────┘
                              │ HTTP / WebSocket
                              ▼
              ┌────────────────────────────┐
              │       APP CONTAINER         │
              │   Next.js (UI + API + PDF)  │
              │          +                  │
              │   Node.js Socket.IO server  │
              │   (real-time sync + timers) │
              │      PDF Storage Volume     │
              └────────────┬────────────────┘
                           │ Prisma
                           ▼
              ┌────────────────────────────┐
              │    PostgreSQL CONTAINER    │
              └────────────────────────────┘
```

The browser connects to the **same application server** for the website, the API, and WebSockets. Only lightweight viewer state (`pdfId / page / scroll-ratio / zoom / rotation`) travels on the wire — never PDF bytes.

### Real-time sync design

- **Server-authoritative timer** — state = `{mode, status, startedAt, pausedAt, elapsed, duration}`. Clients compute display from server timestamps + a captured clock offset, so network latency can't desync displays and late joiners see the correct value instantly.
- **Loop prevention (two layers):**
  1. Every broadcast carries `changedBy` (the sender's session id); the sender ignores its own echo.
  2. The viewer distinguishes the *kind* of the last change (`select | page | scroll | zoom | rotation`) so a scroll event (which also updates the current page) doesn't trigger the page-scroll effect and clobber the scroll position.
  3. An `applyingRemoteRef` flag suppresses the local scroll listener while a remote scroll is being applied.
- **Scroll throttling** — leading emit capped at ~80ms + a trailing flush 120ms after scrolling stops, so both clients converge to the exact same 0..1 ratio.
- **Room state recovery** — on (re)connect the client emits `room:join`; the server replies with the full `RoomState` (participants, pdfs, viewer, timer, presenter), so a refresh instantly restores PDF / page / zoom / timer.

---

## Tech stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, react-pdf (PDF.js)
- **Backend**: Node.js, Socket.IO, REST API routes
- **Database**: Prisma ORM + PostgreSQL (SQLite for the included sandbox runtime)
- **Containerization**: Docker, single app container + separate PostgreSQL container

---

## Project structure

```
prisma/schema.prisma                 Room, PDF, Participant models
src/lib/types.ts                     Shared types (RoomState, ViewerState, TimerState…)
src/lib/constants.ts                 Room code gen, limits, throttle, zoom ranges
src/lib/validation.ts                zod schemas + filename sanitizer (path-traversal safe)
src/lib/pdf-storage.ts               Opaque stored filenames, save/read/delete
src/lib/participant.ts               Anonymous session id in localStorage
src/lib/socket.ts                    Singleton socket client
src/app/page.tsx                     Landing — create / join room
src/app/room/[code]/page.tsx         Room page + name gate + room-not-found
src/app/api/rooms/...                Room + PDF REST endpoints
src/app/api/pdfs/[id]/route.ts       Stream / delete PDF files
src/components/livepdf/
  room-sync-provider.tsx             Central state + socket wiring + clock-offset sync
  room-shell.tsx                     Resizable 3-column layout + sticky footer
  pdf-viewer.tsx                     react-pdf viewer (page/zoom/scroll/rotation/fullscreen)
  pdf-list.tsx                       Upload + list + delete
  timer-panel.tsx                    Stopwatch + countdown (server-authoritative display)
  participant-panel.tsx             Presence
  connection-indicator.tsx           Live Sync / Reconnecting / Disconnected
  presenter-controls.tsx             Presenter mode toggle + assignment (host only)
  room-header.tsx, name-gate.tsx
mini-services/livepdf-sync/index.ts  Socket.IO server, in-memory rooms,
                                     server-authoritative timer, presenter gating,
                                     loop-prevention via `changedBy`
public/pdf.worker.min.mjs            pdfjs worker (matches react-pdf v10)
Dockerfile, docker-compose.yml       Single app container + PostgreSQL container
.env.example, start.sh, .dockerignore
```

---

## Run with Docker (recommended — PostgreSQL)

Requires Docker + Docker Compose.

```bash
cp .env.example .env
docker compose up --build
```

- App container (Next.js + API + Socket.IO) on `http://localhost:3000`
- PostgreSQL container on the internal network
- Uploaded PDFs persisted in a named volume (`pdf_storage`)
- Database persisted in a named volume (`pg_data`)

The Dockerfile swaps the Prisma provider from SQLite to PostgreSQL at build time and runs `prisma migrate deploy` + the Next.js server + the Socket.IO service in **one container** (exactly as specified — do not split into separate containers).

---

## Run for development (Node/Bun, SQLite)

```bash
bun install                      # or npm install
bun run db:push                  # create the SQLite schema (db/custom.db)

# Terminal 1 — start the Socket.IO sync service
cd mini-services/livepdf-sync && bun run dev     # port 3002

# Terminal 2 — start Next.js
bun run dev                                       # port 3000
```

Open `http://localhost:3000`, create a room, and share the code/link with a second browser window to test real-time sync.

> The sandbox runtime in this repo is configured for SQLite (`DATABASE_URL=file:./db/custom.db`). To switch to PostgreSQL locally, change the provider in `prisma/schema.prisma` and set `DATABASE_URL` accordingly.

---

## How to test (two-browser sync)

1. Browser A → create a room → copy the room code / invite link.
2. Browser B → join with the code.
3. A uploads a PDF → B sees it instantly in the list.
4. A opens the PDF → B's viewer opens it too.
5. A scrolls / changes page / zooms → B follows.
6. B does the same → A follows.
7. A starts the stopwatch → B sees the same ticking time.
8. B pauses → A's stopwatch pauses.
9. Try the countdown with presets (1/5/10/15/30/60 min) or a custom duration.
10. Host toggles **Presenter mode** → others become view-only.

---

## Security

- Only PDF files accepted (validated by name + MIME, max 25 MB).
- Original filenames never trusted — sanitized and stored under opaque random names.
- Path-traversal protected (`path.basename` + charset-restricted sanitizer).
- Room codes validated against `^[A-Z2-9]{6}$` (no ambiguous chars).
- WebSocket events validated on the server; presenter control gated by host.
- Server filesystem paths never exposed to the client.

---

## Environment variables (`.env.example`)

```
DATABASE_URL=postgresql://livepdf:livepdf@postgres:5432/livepdf?schema=public
POSTGRES_USER=livepdf
POSTGRES_PASSWORD=livepdf
POSTGRES_DB=livepdf
PORT=3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Verified features

- Create / join room by code + shareable link, anonymous participants
- PDF upload + list + delete (real-time + REST source-of-truth)
- react-pdf viewer: page nav, zoom, fit-width, rotation, fullscreen, loading/error
- Page sync A↔B, Zoom sync A↔B, Scroll sync A↔B (exact convergence)
- Server-authoritative stopwatch + countdown (synced across clients, correct for late joiners)
- Live presence, connection indicator (Live Sync / Reconnecting / Disconnected)
- Presenter mode (host assigns presenter; others become view-only)
- Room state recovery on refresh / reconnect

See `worklog.md` for the full QA log, bugs fixed during verification, and environment notes.
