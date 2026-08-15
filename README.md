# Preply

> **Study together, solve faster.**
>
> A real-time collaborative PDF study room where everyone sees the same document, moves through it together, and stays synchronized across browsers.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-black?logo=socket.io)](https://socket.io/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)](https://www.docker.com/)

Preply is built for students and exam aspirants who want the experience of studying from the **same PDF on the same screen**, even when everyone is using a different browser or device.

Create a private room, upload a question paper or study material, invite others, and collaborate in real time.

## Why Preply?

Traditional study groups usually end up with screenshots, screen sharing, or messages like “which page are you on?”. Preply keeps the shared study material synchronized instead.

- **One shared PDF viewer** — page, scroll position, zoom, and rotation can stay synchronized.
- **Shared study tools** — stopwatch, countdown, notes, markers, annotations, and chat.
- **Room-based collaboration** — join with a short code or shareable link.
- **Presenter mode** — let one participant control the shared viewing experience.
- **Anonymous sessions** — participants can join without creating a full account.
- **Reconnect-friendly state** — a refreshed or reconnected client can recover the room state.

## Feature overview

| Area | Features |
| --- | --- |
| Rooms | Create/join by code, shareable invite links, optional password lock |
| PDF collaboration | Upload, list, delete, synchronized page, scroll, zoom, rotation, fullscreen |
| Study timer | Server-authoritative stopwatch and countdown with presets/custom duration |
| Collaboration | Live participant presence, presenter assignment, shared notes, chat |
| Question workflow | Page-based question markers for shared problem solving |
| Annotation | Shared drawing/pen annotations stored against PDF pages |
| Reliability | Reconnect/state recovery and connection status indicator |
| Security | File validation, sanitized filenames, opaque storage names, server-side event validation |

## How it works

Preply is deployed as a **distributed application**. The frontend, database, and real-time synchronization layer run as separate services so each part can use infrastructure suited to its workload.

```text
                         ┌─────────────────────────┐
                         │        Students         │
                         │   Browser / Mobile Web  │
                         └────────────┬────────────┘
                                      │
                         HTTPS + WebSocket connection
                                      │
                 ┌────────────────────┴────────────────────┐
                 │                                         │
                 ▼                                         ▼
      ┌─────────────────────┐                  ┌─────────────────────┐
      │       Vercel        │                  │       Render        │
      │                     │                  │                     │
      │     Next.js 16      │                  │   Socket.IO Sync    │
      │   Frontend + API    │◄────────────────►│  Real-time service  │
      │                     │                  │                     │
      └──────────┬──────────┘                  └──────────┬──────────┘
                 │                                        │
                 │ Prisma                                 │ Room state /
                 │                                        │ live events
                 ▼                                        │
      ┌─────────────────────┐                             │
      │        Neon         │                             │
      │                     │                             │
      │    PostgreSQL       │◄────────────────────────────┘
      │                     │
      │ Rooms / PDFs /      │
      │ participants / chat │
      │ notes / markers /   │
      │ annotations         │
      └─────────────────────┘
```

### Hosted architecture

- **Vercel** hosts the Next.js application and frontend.
- **Neon** provides the managed PostgreSQL database used through Prisma.
- **Render** runs the long-lived Socket.IO synchronization service responsible for real-time collaboration.
- The browser communicates with **Vercel over HTTPS** for the application/API and with **Render over WebSocket** for live synchronization.
- Database state is persisted in **Neon**, while transient real-time room state is coordinated by the Socket.IO service.

The separation is important because the real-time layer requires a persistent server process, whereas the Next.js application can be deployed through Vercel's serverless/managed infrastructure.

### What gets synchronized?

Preply sends lightweight viewer and collaboration state through Socket.IO rather than sending PDF bytes between participants.

```text
Viewer state
├── PDF selection
├── Current page
├── Scroll ratio
├── Zoom level
└── Rotation

Collaboration state
├── Participants / presence
├── Timer state
├── Presenter state
├── Chat messages
├── Question markers
├── Shared notes
└── PDF annotations
```

PDF files themselves remain managed by the application rather than being transmitted through every WebSocket update.

### Real-time synchronization

Preply treats synchronization as a server-coordinated state problem rather than blindly rebroadcasting browser events.

- **Server-authoritative timer:** clients derive the visible timer value from server timestamps, allowing late joiners and reconnecting clients to converge on the same timer state.
- **State recovery:** clients re-join the room after reconnecting and receive the current room snapshot.
- **Loop prevention:** synchronization metadata identifies the source of changes and remote-applied updates are prevented from immediately echoing back as local changes.
- **Scroll throttling:** high-frequency scroll updates are throttled and flushed so the two viewers converge without flooding the socket.
- **Normalized coordinates:** annotations use normalized page coordinates so drawings remain meaningful across different viewport sizes.

## Deployment stack

The current hosted deployment uses:

| Service | Provider | Responsibility |
| --- | --- | --- |
| Frontend / Web App | **Vercel** | Next.js application and frontend delivery |
| Database | **Neon** | Managed PostgreSQL database via Prisma |
| Live Sync | **Render** | Long-running Socket.IO real-time synchronization service |

This setup keeps the real-time service independent from the frontend deployment and avoids relying on serverless infrastructure for persistent WebSocket connections.

## Tech stack

### Application

- **Next.js 16** — App Router and application runtime
- **React 19** — UI
- **TypeScript 5** — type safety
- **Tailwind CSS 4** — styling
- **shadcn/ui / Radix UI** — interface primitives

### Real-time collaboration

- **Socket.IO 4** — bidirectional communication
- **Server-side room state** — synchronization, presence, timers, presenter controls

### PDF + data

- **react-pdf / PDF.js** — PDF rendering
- **Prisma 6** — ORM and schema management
- **PostgreSQL 16** — production database
- **Neon** — managed PostgreSQL hosting
- **SQLite** — lightweight local development option
- **Zod** — runtime validation
- **Zustand** — client-side state management where needed

### Infrastructure

- **Vercel** — frontend/application hosting
- **Render** — real-time synchronization service hosting
- **Docker + Docker Compose** — reproducible self-hosted deployment
- **Caddy** — included reverse-proxy configuration for self-hosted deployments
- **Bun / npm** — dependency and script execution

## Project structure

```text
Preply/
├── src/
│   ├── app/                       # Next.js pages, layouts, API routes
│   ├── components/livepdf/        # Room UI and collaborative study components
│   └── lib/                       # Types, validation, storage, socket/client utilities
│
├── mini-services/
│   └── livepdf-sync/              # Socket.IO real-time synchronization service
│
├── prisma/
│   └── schema.prisma              # Room, PDF, participant, chat, notes, markers, annotations
│
├── public/
│   └── pdf.worker.min.mjs         # PDF.js worker used by react-pdf
│
├── storage/
│   └── pdfs/                      # Local/self-hosted PDF storage location
│
├── Dockerfile                     # Production application image
├── Dockerfile.sync                # Sync-service image definition
├── docker-compose.yml              # App + PostgreSQL self-hosted deployment
├── Caddyfile                      # Reverse-proxy configuration
├── SETUP.md                       # Detailed local setup guide
├── DEPLOYMENT.md                  # Deployment and hosting guide
└── package.json                   # Scripts and dependencies
```

## Requirements

For local development:

- Node.js 18+ (20+ recommended)
- Bun 1+ or npm 9+
- Git

For Docker deployment:

- Docker 20+
- Docker Compose v2+

## Getting started

### Option A — Local development

The local workflow runs the Next.js application and Socket.IO synchronization service as separate processes. The repository also supports SQLite for lightweight local development.

```bash
git clone https://github.com/sumit-dey-69/Preply.git
cd Preply

bun install
bun run db:push
```

Start the synchronization service in one terminal:

```bash
cd mini-services/livepdf-sync
bun install
bun run dev
```

Start Next.js in another terminal from the project root:

```bash
bun run dev
```

Then open:

```text
http://localhost:3000
```

For the complete environment setup, PDF worker instructions, LAN access, troubleshooting, and configuration details, see [`SETUP.md`](./SETUP.md).

### Option B — Docker / self-hosting

Docker provides a production-like self-hosted deployment with PostgreSQL.

```bash
docker compose up --build
```

The default Compose architecture contains:

- **app** — Next.js application, API, PDF storage, and application runtime
- **postgres** — PostgreSQL 16 database
- **pdf_storage** — persistent uploaded PDF volume
- **pg_data** — persistent PostgreSQL volume

The application is exposed on:

```text
http://localhost:3000
```

Stop the stack without deleting persistent data:

```bash
docker compose down
```

Reset the stack and remove its volumes:

```bash
docker compose down -v
```

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for cloud, VPS, reverse-proxy, and production deployment guidance.

## Environment variables

The exact environment used by a deployment depends on whether the application is running locally, on the hosted stack, or through Docker. The main configuration values are:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Prisma database connection string; production points to Neon PostgreSQL |
| `PORT` | Application port; typically `3000` |
| `NEXT_PUBLIC_APP_URL` | Public URL of the deployed application |
| `NEXT_PUBLIC_SYNC_URL` | URL of the Socket.IO sync service; production points to Render |
| `POSTGRES_USER` | PostgreSQL username for Docker/self-hosting |
| `POSTGRES_PASSWORD` | PostgreSQL password for Docker/self-hosting |
| `POSTGRES_DB` | PostgreSQL database name for Docker/self-hosting |

Do not commit real credentials or production secrets to the repository.

## Usage

A typical study session looks like this:

```text
1. Create a room
2. Share the 6-character room code or invite link
3. Other students join the room
4. Upload the question paper / PDF
5. Open the document together
6. Move between pages, scroll, zoom, or rotate together
7. Start a stopwatch or countdown for timed practice
8. Add question markers, notes, annotations, or chat messages
9. Use Presenter mode when one person should drive the viewer
```

To test collaboration locally, use two separate browser sessions (for example, a normal window and an incognito window) so each participant has an independent anonymous session.

## Data model

The Prisma schema currently covers the core collaboration domain:

```text
Room
├── PDFs
├── Participants
├── ChatMessages
├── QuestionMarkers
├── SharedNote
└── Annotations
```

A participant is represented by an anonymous client session identifier rather than a traditional user account. This keeps room entry lightweight while still allowing participant-specific state such as display name and presenter permissions.

## Security considerations

Preply includes several application-level safeguards for uploaded files and collaborative events:

- Accepts PDF uploads only and enforces a maximum file size.
- Sanitizes original filenames before storage.
- Stores files under opaque/randomized names instead of exposing user-controlled paths.
- Protects storage operations against path traversal.
- Validates room codes before processing them.
- Validates real-time events server-side.
- Restricts presenter controls to authorized participants.
- Keeps filesystem storage paths on the server rather than sending them to browsers.

This project is intended to be **self-hosted or deployed with appropriately secured infrastructure**. Review authentication, authorization, rate limiting, HTTPS, reverse-proxy configuration, backups, and secret management before exposing an instance to untrusted public traffic.

## Development commands

From the project root:

```bash
bun run dev         # start Next.js development server
bun run build       # generate Prisma client, sync schema, build Next.js
bun run start       # start production Next.js standalone server
bun run lint        # run ESLint
bun run db:push     # sync Prisma schema to the configured database
bun run db:generate # regenerate Prisma client
bun run db:migrate  # create/apply a development migration
bun run db:reset    # reset the database (destructive)
```

The Socket.IO service has its own package and development commands under `mini-services/livepdf-sync`.

## Troubleshooting

### PDF worker errors

`react-pdf` requires a matching PDF.js worker. Follow the worker installation step in [`SETUP.md`](./SETUP.md) and make sure the worker version matches the installed PDF.js dependency.

### Real-time synchronization is not working

Make sure the Socket.IO sync service is running and reachable from the browser. In the default local setup it runs on port `3002`. In the hosted deployment, the frontend should point to the Render sync-service URL through `NEXT_PUBLIC_SYNC_URL`.

### Database initialization errors

Run:

```bash
bun run db:push
```

Then restart the application.

### Port conflicts

Check which process is using ports `3000` and `3002`, or update the relevant local configuration before starting the services.

## Documentation

| Document | Purpose |
| --- | --- |
| [`SETUP.md`](./SETUP.md) | Detailed local development setup and troubleshooting |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Cloud, VPS, Docker, and deployment guidance |
| [`Caddyfile`](./Caddyfile) | Reverse-proxy configuration |
| [`docker-compose.yml`](./docker-compose.yml) | Containerized app + PostgreSQL self-hosted stack |

## Contributing

Contributions are welcome.

Before opening a pull request:

1. Keep changes focused and explain the user-facing or architectural impact.
2. Run the relevant checks locally, including `bun run lint` and the appropriate database/build commands.
3. Test real-time behavior with at least two independent browser sessions when changing synchronization logic.
4. Update documentation when setup, environment variables, architecture, or behavior changes.

## Roadmap

Preply is an evolving project. Future work may include stronger authentication, richer collaborative study tools, better observability, and additional deployment options.

## License

No license file is currently defined in the repository. Unless a license is added, the source should not be assumed to be available for unrestricted redistribution or reuse.

## Project status

Preply is an actively developed project focused on collaborative exam preparation and shared PDF study sessions.

> **Preply — one shared PDF, synchronized across every browser.**
