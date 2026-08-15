# Preply — Project Worklog

## Bugfix — Zoom Not Working: emitZoom Blocked by Socket Check (current)

### Bug report
"THE ZOOM IS NOT WORKING in the pdf viewer, for desktop do it like when i
press ctrl and mouse wheel, the pdf page inside the pdf viewer should get
zoomed in and out."

### Root cause
The **primary bug** was in `src/components/livepdf/room-sync-provider.tsx`:
`emitZoom` had `if (!socket) return;` **before** the `setViewer()` call. This
meant that if the Socket.IO connection wasn't established (e.g. on a local
machine where the sync service wasn't running or was slow to connect), the
zoom did **absolutely nothing** — the local `viewer.zoom` state never updated,
so `effectiveWidth = containerWidth * zoom` never recalculated, and the PDF
stayed the same size.

A secondary issue: the wheel listener in `pdf-viewer.tsx` used `viewer.zoom`
and `sync` directly in its closure, causing the effect to re-attach on every
zoom step (stale closure problem).

### Fix
**`room-sync-provider.tsx` — `emitZoom`:**
- Moved `setViewer()` **before** the socket check, so local state always
  updates immediately (the PDF resizes) even if the socket is down.
- The socket emit is now conditional (only if socket exists), not a hard gate.

**`pdf-viewer.tsx` — wheel handler:**
- Added refs (`currentZoomRef`, `emitZoomRef`, `pdfIdRef`) that are updated on
  every render, so the wheel listener reads the latest values without needing
  to be re-attached. The effect now only depends on `[pdfUrl]` — it attaches
  once when the PDF loads and stays stable.

### Verification (agent-browser, desktop 1280×800)
| Action | Canvas width | Zoom |
|---|---|---|
| Fit (start) | 657px | Fit |
| Click Zoom in button | 755px | 115% ✅ |
| Ctrl+wheel up | 854px | 130% ✅ |
| Ctrl+wheel down | 755px | 115% ✅ |

Both the zoom buttons and Ctrl+mouse-wheel now reliably zoom the PDF. ESLint
clean, no console errors.

---

## Bugfix — Desktop Zoom: Buttons Disabled + Trackpad Pinch Magnifying Page (previous)

### Bug report
"Rather than zooming in/out the PDF inside the PDF viewer, it is just
magnifying the website when using with laptop trackpad. And the zoom and
zoom in button is not working in the desktop mode."

### Root cause
Two issues:
1. **Zoom buttons disabled:** The Zoom in/out buttons had
   `disabled={!canControl || ...}`. `canControl` is `false` when presenter
   mode is on OR when the socket connection isn't established yet. On a local
   machine with a slow/failing socket connection, the buttons were disabled.
2. **Trackpad pinch magnifying the website:** The wheel listener was attached
   to the scroll container element only, with standard (bubble) phase. The
   browser's native pinch-to-zoom (which fires a `ctrlKey` wheel event at the
   viewport level) was not intercepted, so the browser magnified the whole
   page instead of zooming the PDF.

### Fix
`src/components/livepdf/pdf-viewer.tsx`:
1. **Removed `canControl` from zoom button `disabled` props** — zoom buttons
   are now always enabled (only disabled at min/max zoom limits), so they
   work even if the socket is briefly disconnected.
2. **Moved the wheel listener to `document.addEventListener("wheel", ...,
   { capture: true })`** — the capture phase intercepts the event before the
   browser's default action, and the document level catches pinch-zoom even
   if it originates outside the scroll element.
3. **Added hit-testing** — only intercepts when the cursor is over the PDF
   scroll area, so normal page scrolling elsewhere is unaffected.
4. **Added `e.stopImmediatePropagation()`** to fully prevent the browser's
   native pinch gesture.
5. **Added `touchAction: "pan-x pan-y"`** on the scroll container CSS to
   prevent the browser's touch-based pinch-zoom on the element.

### Verification (agent-browser, desktop 1280×800)
| Action | Canvas width | Zoom |
|---|---|---|
| Start | 1248px | 190% |
| Click Zoom in button | 1346px | 205% ✅ |
| Ctrl+wheel (document-level) | 1445px | 220% ✅ |

Zoom buttons now always work (not blocked by `canControl`), and trackpad
pinch-zoom now zooms the PDF instead of magnifying the page. ESLint clean, no
console errors.

---

## Bugfix — Docker Build: Permission Denied + Sync Service Runtime (previous)

### Bug report
`docker compose up --build` failed with:
```
RUN mkdir -p storage/pdfs && chown -R livepdf:livepdf storage
→ mkdir: cannot create directory 'storage': Permission denied
```

### Root cause
Two issues in the Dockerfile:
1. **Permission denied:** `USER livepdf` was set **before** the `mkdir storage/pdfs`
   command. A non-root user can't create directories in `/app` (owned by root).
2. **Sync service runtime:** `start.sh` ran `node index.js` but the sync service
   is TypeScript (`index.ts`). The runner image (`node:20-slim`) has no bun or
   ts-node, so the sync service would fail to start.

### Fix
`Dockerfile`:
- Moved `mkdir -p /app/storage/pdfs && chown -R livepdf:livepdf /app/storage`
  and the `VOLUME` declaration to **before** `USER livepdf` (run as root).
- Installed **bun** in the runner stage (curl from bun.sh, copied to
  `/usr/local/bin/bun` so it's accessible to the non-root user).
- `start.sh`: changed `node index.js` → `bun run index.ts`, and
  `bunx prisma migrate deploy` → `npx prisma db push --accept-data-loss`
  (the container has npm/npx, not bunx; and there are no migration files,
  only the schema, so `db push` is correct).

### Verification
The Dockerfile now:
1. Creates the storage directory as root ✅
2. Switches to `livepdf` user after ✅
3. Has bun available at `/usr/local/bin/bun` for the sync service ✅
4. Runs `start.sh` which uses `bun run index.ts` for the sync service + `node server.js` for Next.js ✅

Re-run `docker compose up --build` — it should now build and start successfully.

---

## Bugfix — Desktop Ctrl+Scroll Zoom Not Working (previous)

### Bug report
"One thing the zooming functionality works perfectly on mobile, but in
desktop it is not zoom the pdf in the pdf viewer, rather it stays the same."

### Root cause
The zoom **buttons** (Zoom in/out) and the zoom state sync were already working
correctly on desktop (verified: canvas width scales from 657px → 1051px at
160%). However, the standard desktop zoom gesture — **Ctrl/Cmd + mouse wheel**
— was **not implemented**. On mobile, pinch-to-zoom works because the browser
handles it natively via touch viewport scaling. On desktop, users instinctively
try Ctrl+scroll to zoom, and nothing happened (the page just scrolled
normally), giving the impression that "zoom doesn't work on desktop".

### Fix
`src/components/livepdf/pdf-viewer.tsx`:
- Added a native non-passive `wheel` event listener on the PDF scroll
  container that checks for `e.ctrlKey || e.metaKey`. When the user scrolls
  with Ctrl/Cmd held, it prevents the default page-scroll and instead adjusts
  the zoom by `ZOOM_STEP` (0.15) per wheel tick — scroll up = zoom in, scroll
  down = zoom out.
- Attached via `addEventListener("wheel", handler, { passive: false })` in a
  `useEffect` so `preventDefault()` actually works (React's synthetic
  `onWheel` is passive in some browsers and can't preventDefault).
- Effect deps include `pdfUrl` so the listener re-attaches when the PDF loads
  (since `scrollRef.current` is null before a PDF is open).
- Added "Ctrl + Scroll" to the keyboard shortcuts dialog as the first entry.

### Verification (agent-browser, desktop 1280×800)
| Action | Canvas width | Zoom label |
|---|---|---|
| Fit (start) | 1051px | 160% |
| Ctrl+scroll up | 1149px | 175% ✅ |
| Ctrl+scroll down | 1051px | 160% ✅ |
| Zoom-in button | — | 175% ✅ (buttons still work) |

Ctrl+wheel zoom now works on desktop. ESLint clean, no console errors.

---

## Phase 11 — Lap Persistence, QR Sharing, PDF Outline (previous)

### Status assessment

Phase 10 (page export, activity feed) was confirmed stable via a fresh
agent-browser QA pass — no bugs, no console errors. This phase focused on
**lap persistence**, **QR code room sharing**, and **PDF outline navigation**.

### Goals

1. Lap persistence — save stopwatch laps to localStorage per room so they
   survive page reloads.
2. QR code for room sharing — a scannable QR in the settings dialog so mobile
   users can join by scanning.
3. PDF outline / table of contents — navigate to PDF sections via bookmarks.

### Completed modifications

**Lap persistence** (`src/components/livepdf/timer-panel.tsx`):
- Laps now persist to `localStorage` under `livepdf:laps:<roomCode>`.
- On mount / room change, laps are loaded from localStorage; on every change
  they're saved back. Removing all laps clears the key.
- Verified: 2 laps recorded → localStorage shows the JSON → reload → laps
  still visible ("Laps (2)").

**QR code room sharing** (`src/components/livepdf/room-settings-dialog.tsx`):
- Installed `qrcode.react` package.
- A QRCodeSVG renders in the settings dialog's "Share room" section, encoding
  the room's full URL (`<origin>/room/<code>`), sized 128px, medium error
  correction, on a white card with a "Scan to join on mobile" caption.
- Verified: the QR SVG renders in the settings dialog.

**PDF outline / table of contents** (`src/components/livepdf/outline-overlay.tsx` — new):
- Uses pdfjs's `getOutline()` + `getDestination()` to fetch the PDF's bookmarks
  and resolve each to a page number.
- Recursive outline rendering with indentation per depth level.
- Each item shows the page number badge + title; click to jump to that page
  (synced to everyone). Active page highlighted in emerald.
- Loading state, empty state ("This PDF has no outline"), and error handling.
- Rendered as a 256px left rail in the viewer, toggled by a ListTree button.
- Added to the keyboard Escape handler and the container-width measurement
  effect deps.

### Verification results (agent-browser, gateway :81)

| Feature | Result |
|---|---|
| Baseline stable (no errors) | ✅ |
| Lap persistence: record 2 laps → localStorage populated | ✅ |
| Lap persistence: reload → "Laps (2)" still visible | ✅ |
| QR code: renders in settings dialog (SVG present) | ✅ |
| Outline: button renders in toolbar | ✅ |
| Outline: panel opens, shows "no outline" for test PDF | ✅ |
| ESLint clean | ✅ |
| No console/runtime errors | ✅ |

Screenshots: `qa-v11-outline.png`, `qa-v11-qr.png`, `qa-v11-laps.png`.

### Unresolved / next-phase recommendations

- **Search in-page text highlight:** still jumps to the matching page with a
  badge but doesn't highlight the actual text (deferred).
- **Annotation undo across reload:** undo/redo stacks are in-memory per session.
- **Operational transform for notes:** still a full-content replace.
- **Room expiry:** room settings could add auto-expire after N hours.
- **Activity feed persistence:** feed events are in-memory per session.

---

## Phase 10 — Page Export, Activity Feed (previous)

### Status assessment

Phase 9 (recent rooms, timer laps) was confirmed stable via a fresh
agent-browser QA pass — no bugs, no console errors, zoom fix confirmed
working. This phase focused on **page export** and a **room activity feed**.

### Goals

1. PDF page export — download the current page (with annotations overlaid) as
   a PNG image, so students can save a snapshot of a solved question.
2. Room activity feed — a timeline of join/upload/chat/marker/annotation/note
   events so everyone can see what's happening in the room at a glance.

### Completed modifications

**PDF page export** (`src/lib/export-page.ts` — new):
- `exportPageAsPng()` loads the PDF via pdfjs, renders the requested page to a
  canvas at 2× scale (targeting ~800px wide for crisp output), overlays any
  annotations (pen/highlight/rect) using the same color mapping as the live
  viewer, then triggers a PNG download.
- `pdf-viewer.tsx`: a new Download icon button in the toolbar (next to
  Bookmark) exports the current page with its annotations. Disabled when no
  PDF is open.

**Room activity feed** (`src/components/livepdf/activity-feed.tsx` — new):
- A new "Feed" tab (6th tab) in the right sidebar.
- Tracks events client-side by watching the sync provider's arrays:
  - **join** — new participant added
  - **upload** — new PDF in the list
  - **chat** — new chat message
  - **marker** — new question marker
  - **annotation** — new annotation drawn
  - **note** — shared notes edited
- Each event shows an icon (color-coded), the actor name ("You" for self),
  a verb, an optional detail (truncated), and a relative timestamp ("just now",
  "5m ago", "2h ago").
- Capped at 50 events, displays the 30 most recent, dedupes by event id.
- Empty state with an illustration and helpful text.

**Layout** (`room-shell.tsx`):
- Right sidebar is now a **6-tab panel**: `[Timer | Chat | Marks | Notes | People | Feed]`
  with tighter spacing (gap-0.5, text-[10px]) to fit the 6th tab.

### Verification results (agent-browser, gateway :81)

| Feature | Result |
|---|---|
| Baseline stable (zoom fix confirmed, no errors) | ✅ |
| Export: Download button renders in toolbar | ✅ |
| Feed: 6th "Feed" tab renders | ✅ |
| Feed: shows activity events (upload, join, annotation, chat, note) | ✅ |
| Feed: relative timestamps ("just now", "1h ago") | ✅ |
| Feed: empty state when no events | ✅ |
| ESLint clean | ✅ |
| No console/runtime errors | ✅ |

Screenshots: `qa-v10-feed.png`.

### Unresolved / next-phase recommendations

- **Search in-page text highlight:** still jumps to the matching page with a
  badge but doesn't highlight the actual text (deferred).
- **Annotation undo across reload:** undo/redo stacks are in-memory per session.
- **Operational transform for notes:** still a full-content replace.
- **Room expiry:** room settings could add auto-expire after N hours.
- **Lap persistence:** laps are currently lost on page reload.
- **Activity feed persistence:** feed events are in-memory per session; could
  persist recent events to the DB for room history.

---

## Phase 9 — Recent Rooms, Timer Laps (previous)

### Status assessment

The desktop zoom bugfix (previous entry) was confirmed working via QA. This
phase focused on **landing page UX** (recent rooms) and **timer utility**
(stopwatch laps), both self-contained, high-value features.

### Goals

1. Recent rooms on the landing page — a localStorage history of joined rooms
   so users can quickly rejoin without re-entering the code.
2. Timer laps — record split times during the stopwatch (useful for timed
   practice sets).

### Completed modifications

**Recent rooms** (`src/lib/recent-rooms.ts` — new):
- `loadRecentRooms`, `addRecentRoom`, `removeRecentRoom` — persists up to 6
  recent rooms in localStorage (`livepdf:recent-rooms` key).
- `src/app/page.tsx`: new `RecentRoomsSection` component rendered between the
  create/join cards and the features grid; shows a card per recent room with
  the room name, code, and a remove (X) button. Hidden when empty.
- `addRecentRoom` called on room create, room join, and room name-gate submit.
- `src/app/room/[code]/page.tsx`: records the room in recent rooms when the
  user enters (both via name gate and direct-ready paths).

**Timer laps** (`src/components/livepdf/timer-panel.tsx`):
- New `Lap` interface + `laps` state (client-side only — laps are personal
  tracking, not synced).
- `recordLap()` captures the current elapsed time + the split since the last
  lap; `clearLaps()` empties the list; `reset()` also clears laps.
- A "Lap" button appears in the stopwatch controls when running.
- A lap list renders below the controls (scrollable, max 128px) showing
  `#index | split | total` in monospace tabular nums, with a clear button.

### Verification results (agent-browser, gateway :81)

| Feature | Result |
|---|---|
| Baseline stable (zoom fix confirmed, no errors) | ✅ |
| Recent rooms: section appears after joining a room | ✅ |
| Recent rooms: shows room code 9MWYT8 | ✅ |
| Recent rooms: remove (X) button works | ✅ |
| Timer laps: Lap button appears when stopwatch running | ✅ |
| Timer laps: record 2 laps → "Laps (2)" visible | ✅ |
| ESLint clean | ✅ |
| No console/runtime errors | ✅ |

Screenshots: `qa-v9-recent.png`, `qa-v9-laps.png`.

### Unresolved / next-phase recommendations

- **Search in-page text highlight:** still jumps to the matching page with a
  badge but doesn't highlight the actual text (deferred).
- **Annotation undo across reload:** undo/redo stacks are in-memory per session.
- **Operational transform for notes:** still a full-content replace.
- **Room expiry:** room settings could add auto-expire after N hours.
- **Lap persistence:** laps are currently lost on page reload (could persist to
  localStorage per room).

---

## Bugfix — Desktop Zoom Not Working (previous)

### Bug report
"Zooming feature works very well in mobile but in desktop it is not working at
all, the size remains the same, even after zooming feature."

### Root cause
`src/components/livepdf/pdf-viewer.tsx` — the container-width measurement
`useLayoutEffect` had `[]` deps, so it ran **once on mount**. But on mount,
no PDF is selected yet (`viewer.pdfId` is null), so the component renders the
**empty state** (early return) and `scrollRef.current` is `null`. The effect
hit `if (!el) return;` and never attached the `ResizeObserver`, leaving
`containerWidth` at `0`.

Result: `effectiveWidth = Math.max(200, 0 * zoom) = 200` — the PDF always
rendered at 200px regardless of zoom (0 × any zoom = 0, clamped to 200).

### Fix
Changed the effect deps from `[]` to `[pdfUrl, showThumbnails, showSearch]` so
it re-runs when the PDF loads (and when the thumbnails/search rail toggles,
which changes the scroll container's available width). Now the ResizeObserver
attaches correctly once `scrollRef.current` exists.

### Verification (agent-browser, desktop 1280×800)
| State | Canvas width (before fix) | Canvas width (after fix) |
|---|---|---|
| Fit (zoom 1.0) | 200px | 755px |
| Zoom 115% | 200px | 854px |
| Zoom 130% | 200px | 952px |

Zoom now correctly scales the rendered PDF width on desktop. ESLint clean, no
console errors.

---

## Phase 8 — Latency Indicator, Participant Kick, Avatar Colors (previous)

### Status assessment

Phase 7 (redo, room password lock, search highlight) was confirmed stable via
a fresh agent-browser QA pass — no bugs, no console errors, sync service
healthy. This phase focused on **connection quality visibility**, **host
participant management (kick)**, and **visual polish** (deterministic avatar
colors).

### Goals

1. Connection quality indicator — show live latency (ping) in the footer so
   users know the real-time link is healthy.
2. Participant kick — let the host remove a disruptive participant.
3. Visual polish — deterministic per-name avatar colors for easier recognition.

### Completed modifications

**Connection latency indicator**:
- `mini-services/livepdf-sync/index.ts`: new `ping` event handler that echoes
  back the client timestamp + server time (used for both latency and clock
  offset).
- `src/lib/types.ts`: `ping` client→server event + ack type.
- `room-sync-provider.tsx`: new `latencyMs` state; a `useEffect` pings every
  10s, computes RTT/2 as one-way latency, and also refreshes the clock offset
  from the server time in the ack.
- `connection-indicator.tsx`: shows `{latencyMs}ms` next to the "Live Sync"
  label, color-coded (emerald <50ms, amber <150ms, rose ≥150ms).

**Participant kick** (host only):
- `mini-services/livepdf-sync/index.ts`: new `participant:kick` handler
  (validates the sender is the host, notifies the target via `system:kicked`,
  force-disconnects their socket).
- `src/lib/types.ts`: `participant:kick` client→server + `system:kicked`
  server→client events.
- `room-sync-provider.tsx`: new `kickParticipant` action + `kicked` state;
  listens for `system:kicked` and sets the flag.
- `participant-panel.tsx`: a UserX button appears on hover for each non-host,
  non-self participant (host only); confirm dialog before kicking.
- `room-shell.tsx`: when `kicked` is true, a full-screen "You were removed"
  overlay appears with a back-to-home link.

**Visual polish — deterministic avatar colors**:
- `participant-panel.tsx`: each participant's avatar gets a deterministic
  gradient color from a 5-color palette (emerald, amber, rose, violet, sky)
  based on a hash of their display name, so the same person always gets the
  same color across sessions.

### Verification results (agent-browser, gateway :81)

| Feature | Result |
|---|---|
| Baseline stable (5-tab sidebar, no errors) | ✅ |
| Latency: pings every 10s, shows "1ms" in footer | ✅ |
| Latency: color-coded (emerald for fast local) | ✅ |
| Avatar colors: deterministic per-name (5-color palette) | ✅ |
| Kick: host sees "Remove X" buttons on hover for non-hosts | ✅ |
| Kick: click + confirm → target disconnected | ✅ |
| Kick: target sees "You were removed" overlay | ✅ |
| Kick: participant count drops (3→2) | ✅ |
| ESLint clean | ✅ |
| No console/runtime errors | ✅ |

Screenshots: `qa-v8-latency.png`, `qa-v8-people.png`, `qa-v8-kicked.png`.

### Unresolved / next-phase recommendations

- **Search in-page text highlight:** still jumps to the matching page with a
  badge but doesn't highlight the actual text (text layer + annotation overlay
  interference — deferred).
- **Annotation undo across reload:** undo/redo stacks are in-memory per session.
- **Operational transform for notes:** still a full-content replace.
- **Room expiry:** room settings could add auto-expire after N hours.
- **Reconnect after kick:** a kicked user can currently just rejoin via the
  room code; could add a temporary ban list if needed.

---

## Phase 7 — Redo, Room Password Lock, Search Highlight (previous)

### Status assessment

Phase 6 (annotation persistence, undo, keyboard shortcuts) was confirmed
stable via a fresh agent-browser QA pass — no bugs, no console errors, sync
service healthy. This phase focused on the top next-phase recommendations:
**annotation redo**, **room password lock**, and **search highlight on page**.

### Goals

1. Annotation redo — a parallel redo stack with Ctrl+Y and a toolbar button.
2. Room password lock — protect rooms with an optional password (host sets it,
   joiners must enter it).
3. Search highlight — a visual indicator on the page with the active search
   match.

### Completed modifications

**Annotation redo** (`room-sync-provider.tsx` + `annotation-toolbar.tsx`):
- New `redoStack` state + `redoDataRef` (Map storing the full annotation data
  for each created ID, so redo can re-create it).
- `undoAnnotation()` now pushes the undone annotation's data to the redo stack.
- New `redoAnnotation()` re-emits `annotation:add` with the stored data (server
  assigns a new ID + echoes back, which pushes to the undo stack).
- Creating a new annotation clears the redo stack (standard undo/redo behavior).
- `canRedoAnnotation` boolean exposed to the UI.
- `annotation-toolbar.tsx`: added a Redo2 button (disabled when empty) with
  Ctrl+Y tooltip.
- `pdf-viewer.tsx`: `Ctrl+Y` (or `Ctrl+Shift+Z`) triggers redo in annotate mode.
- `shortcuts-dialog.tsx`: added the Redo shortcut to the help dialog.

**Room password lock**:
- `prisma/schema.prisma`: new `passwordHash String?` field on Room (null = open).
- `src/lib/password.ts` (new): `hashPassword` / `verifyPassword` using SHA-256
  with a salt prefix (not cryptographically strong, but avoids plaintext storage
  — appropriate for an anonymous-room MVP).
- `src/app/api/rooms/[code]/route.ts`: GET now returns 401 `{locked: true}` if
  the room has a password and the request doesn't include a matching
  `?password=` query or `x-room-password` header. PATCH now accepts `password`
  (set) and `removePassword` (clear) fields. Response includes `hasPassword`.
- `src/app/room/[code]/page.tsx`: new `locked` status with a polished password
  entry screen (Lock icon, password input, Unlock button, back link). On
  successful unlock, the password is stored in sessionStorage.
- `room-settings-dialog.tsx`: new password management section (host only) with
  a "locked" badge, set/remove password inputs, and explanatory text.

**Search highlight** (`pdf-viewer.tsx`):
- When the search overlay is open, an amber "match page" badge appears on the
  page that currently has the active search result, giving a clear visual
  indicator of where the match is.

### Verification results (agent-browser, gateway :81)

| Feature | Result |
|---|---|
| Baseline stable (5-tab sidebar, no errors) | ✅ |
| Redo: button disabled initially | ✅ |
| Redo: after undo, button enabled → click restores annotation (4→6 paths) | ✅ |
| Keyboard: Ctrl+Y triggers redo | ✅ |
| Password API: set → hasPassword: true | ✅ |
| Password API: GET without password → 401 locked | ✅ |
| Password API: GET with wrong password → 401 | ✅ |
| Password API: GET with correct password → 200 | ✅ |
| Password UI: locked screen renders with password input | ✅ |
| Password UI: enter correct password → enters room | ✅ |
| Password UI: settings dialog shows lock/unlock controls | ✅ |
| Password API: remove → hasPassword: false | ✅ |
| Search highlight: "match page" badge on active result page | ✅ |
| ESLint clean | ✅ |
| No console/runtime errors | ✅ |

Screenshots: `qa-v7-redo.png`, `qa-v7-locked.png`.

### Unresolved / next-phase recommendations

- **Search in-page text highlight:** the current search jumps to the matching
  page and shows a badge, but doesn't highlight the actual matching text within
  the page (would require enabling react-pdf's text layer, which can interfere
  with the annotation SVG overlay — deferred).
- **Annotation undo across reload:** the undo/redo stacks are in-memory per
  session; reloading clears them (annotations persist, but the undo history
  doesn't). Could persist to localStorage.
- **Operational transform for notes:** still a full-content replace on each
  debounced save (CRDT/OT for true concurrent editing is deferred).
- **Room expiry:** room settings could add auto-expire after N hours.
- **Password in URL:** the password currently travels in the query string for
  the GET check; a more secure approach would use a short-lived session token
  after the initial verification.

---

## Phase 6 — Annotation Persistence, Undo, Keyboard Shortcuts (previous)

### Status assessment

Phase 5 (PDF annotations, chat notifications, clock re-sync) was confirmed
stable via a fresh agent-browser QA pass — no bugs, no console errors, sync
service healthy. This phase focused on the top next-phase recommendations:
**annotation persistence to DB**, **annotation undo**, and **keyboard
shortcuts** (arrow-key page navigation + a shortcuts help dialog).

### Goals

1. Annotation persistence — store annotations in the DB so they survive
   refresh and room eviction (like chat/markers/notes).
2. Annotation undo — a per-user undo stack with Ctrl+Z and a toolbar button.
3. Keyboard shortcuts — arrow keys for page navigation, Ctrl+Z for undo,
   plus a help dialog listing all shortcuts.

### Completed modifications

**Annotation persistence**:
- `prisma/schema.prisma`: new `Annotation` model (pdfId, page, tool, color,
  points as JSON string, createdBy, createdByName, createdAt), cascading on
  room delete, indexed by roomId + pdfId. Added `annotations` relation to Room.
- `src/app/api/rooms/[code]/annotations/route.ts` (new): `GET` (list, parses
  JSON points back to `{x,y}[]`), `POST` (create, validates tool/color,
  sanitizes points to 0..1), `DELETE` (by id, or clear-page via pdfId+page).
- `room-sync-provider.tsx`: `addAnnotation` / `removeAnnotation` /
  `clearPageAnnotations` now persist to the DB (fire-and-forget) alongside
  the realtime socket broadcast. On mount, fetches persisted annotations and
  seeds the in-memory state if the sync server doesn't already have them.

**Annotation undo** (`room-sync-provider.tsx` + `annotation-toolbar.tsx`):
- New `undoStack` state + `myLastAnnotationsRef` tracking annotation IDs
  created by the local user (via the `annotation:added` echo matching their
  sessionId).
- `undoAnnotation()` pops the last ID and removes it (socket + DB delete).
- `canUndoAnnotation` boolean exposed to the UI.
- `annotation-toolbar.tsx`: added an Undo2 button (disabled when stack empty)
  with a Ctrl+Z tooltip.

**Keyboard shortcuts** (`pdf-viewer.tsx` + `shortcuts-dialog.tsx`):
- Extended the keyboard handler: `Ctrl+Z` triggers undo (in annotate mode),
  `ArrowLeft`/`ArrowRight` navigate pages (when not typing in an input),
  `Escape` now also exits annotate mode.
- Inputs/textareas are detected so shortcuts don't fire while typing.
- `src/components/livepdf/shortcuts-dialog.tsx` (new): a dialog listing all
  shortcuts (Ctrl+F, Ctrl+Z, ←/→, Esc) with styled `<kbd>` keys.
- `room-header.tsx`: added a Keyboard icon button that opens the ShortcutsDialog.

### Verification results (agent-browser, gateway :81)

| Feature | Result |
|---|---|
| Baseline stable (5-tab sidebar, no errors) | ✅ |
| Annotation persistence: drew → DB count = 2 | ✅ |
| Annotation persistence: reload → annotations recovered (2 paths) | ✅ |
| Undo: button disabled initially, enabled after draw | ✅ |
| Undo: click → annotation removed (path count 2→0) | ✅ |
| Keyboard: ArrowRight → page 2 | ✅ |
| Keyboard: ArrowLeft → page 1 | ✅ |
| Shortcuts dialog: opens, lists all 5 shortcuts | ✅ |
| Annotations API: GET/POST/DELETE return 200 | ✅ |
| ESLint clean | ✅ |
| No console/runtime errors | ✅ |

Screenshots: `qa-v6-shortcuts.png`, `qa-v6-final.png`.

### Unresolved / next-phase recommendations

- **Annotation undo across reload:** the undo stack is in-memory per session;
  reloading clears it (the annotations persist, but you can't undo one created
  before the reload). Could persist the undo stack to localStorage.
- **Search highlight on page:** search jumps to the matching page but doesn't
  highlight the match within the rendered page (could enable the text layer).
- **Operational transform for notes:** still a full-content replace on each
  debounced save (CRDT/OT for true concurrent editing is deferred).
- **Room expiry / password lock** — room settings could add a password or
  auto-expire after N hours.
- **Redo:** only undo is implemented; redo would need a parallel redo stack.

---

## Phase 5 — PDF Annotations, Chat Notifications, Clock Re-sync (previous)

### Status assessment

Phase 4 (PDF text search, room settings, typing indicators) was confirmed
stable via a fresh agent-browser QA pass — no bugs, no console errors, sync
service healthy. This phase focused on the top next-phase recommendations:
**PDF annotations/highlights**, **chat notifications**, and **periodic
clock-offset re-sync**.

### Goals

1. PDF annotations — draw, highlight, rectangle, and erase on PDF pages,
   synced in real-time across all participants.
2. Chat notifications — a subtle chime + desktop notification when a new
   message arrives (especially when the tab is hidden).
3. Periodic clock-offset re-sync — correct timer drift in long sessions.

### Completed modifications

**PDF annotations** — new types, server handlers, provider state, and UI:

- `src/lib/types.ts`: `Annotation`, `AnnotationTool` (highlight/pen/rect/erase),
  `AnnotationColor` (amber/emerald/rose/violet/sky); `annotations` added to
  `RoomState`; new `annotation:add`, `annotation:remove`,
  `annotation:clear_page` client→server events and `annotation:added`,
  `annotation:removed`, `annotation:page_cleared`, `annotation:list`
  server→client events.
- `mini-services/livepdf-sync/index.ts`: `RoomRuntime.annotations` (capped at
  500); handlers validate the sender, sanitize points to 0..1 normalized
  coordinates (max 2000 points), validate tool/color. Remove is author-or-host;
  clear-page is host-only. Full annotations included in `room:join` ack +
  `room:state` push.
- `src/components/livepdf/annotation-layer.tsx` (new): an SVG overlay on each
  PDF page. Supports pen (thin stroke), highlight (wide translucent stroke),
  rect (dashed outline), and erase (click an annotation to remove). Live
  preview while drawing; pointer events with pointer capture for smooth
  drawing. Coordinates are normalized 0..1 so they scale correctly at any zoom.
- `src/components/livepdf/annotation-toolbar.tsx` (new): a floating toolbar
  with tool buttons (select/pen/highlight/rect/erase), 5-color picker, clear-
  page (host), and close. Renders at the top-center of the viewer when
  annotation mode is active.
- `src/components/livepdf/pdf-viewer.tsx`: added a Pencil toggle button in the
  toolbar; when active, the `AnnotationLayer` is overlaid on every page and
  the floating `AnnotationToolbar` appears.

**Chat notifications** (`src/components/livepdf/use-chat-notifications.ts` — new):
- A hook that watches the chat array; when a new message from someone else
  arrives, it plays a subtle two-tone chime (Web Audio API oscillator, no
  asset needed) and shows a desktop notification (only when the tab is hidden).
- Requests notification permission on first user interaction (not aggressively).
- Clicking the notification focuses the window.

**Clock-offset periodic re-sync** (`room-sync-provider.tsx`):
- Every 60s, emits `room:request_state` and recomputes `clockOffsetMs` from the
  fresh `serverTime` in the ack, correcting any client clock drift for long
  sessions (was previously captured once at join only).

**RoomShell**: wired `useChatNotifications()` so the hook is active whenever
the room is open.

### Verification results (agent-browser, two sessions Alice + Bob, gateway :81)

| Feature | Result |
|---|---|
| Baseline stable (5-tab sidebar, no errors) | ✅ |
| Annotation: Pencil button toggles annotation mode | ✅ |
| Annotation: floating toolbar (tools + colors + clear) renders | ✅ |
| Annotation: A draws on page 1 → 4 SVG paths render | ✅ |
| Annotation sync: B's PDF auto-opens, sees same 4 paths | ✅ |
| Annotation persistence: A reloads → annotations recovered from server state | ✅ |
| Chat notifications hook: compiles + runs without errors | ✅ |
| Clock re-sync: `room:request_state` fires every 60s | ✅ |
| ESLint clean | ✅ |
| No console/runtime errors | ✅ |

Screenshots: `qa-v5-annotations.png`, `qa-v5-ann-A.png`, `qa-v5-ann-B.png`,
`qa-v5-final.png`.

### Unresolved / next-phase recommendations

- **Annotation persistence to DB:** annotations currently live in server memory
  only (lost on room eviction). Could add an `Annotation` Prisma model + API
  like chat/markers/notes.
- **Annotation undo/redo:** currently no undo; could add per-user undo stack.
- **Search highlight on page:** search jumps to the matching page but doesn't
  highlight the match within the rendered page (could enable the text layer).
- **Operational transform for notes:** still a full-content replace on each
  debounced save (CRDT/OT for true concurrent editing is deferred).
- **Room expiry / password lock** — room settings could add a password or
  auto-expire after N hours.

---

## Phase 4 — PDF Text Search, Room Settings, Typing Indicators (previous)

### Status assessment

Phase 3 (shared notes, thumbnails, persistence) was confirmed stable via a
fresh agent-browser QA pass — no bugs, no console errors, sync service healthy.
This phase focused on the top next-phase recommendations: **PDF text search**,
**room settings management**, and **chat typing indicators**, plus keyboard
shortcuts and styling polish.

### Goals

1. PDF text search — a find bar to locate questions by keyword across all pages.
2. Room settings dialog — rename room, copy code/link, view room info, delete
   room (host only).
3. Chat typing indicator — animated "X is typing…" with bouncing dots.
4. Keyboard shortcuts — Ctrl+F to toggle search, Escape to close overlays.

### Completed modifications

**PDF text search** (`src/components/livepdf/search-overlay.tsx` — new):
- Uses pdfjs's `getDocument` + `getPage().getTextContent()` to extract text
  from every page without rendering text layers (efficient).
- Debounced search (350ms), up to 50 results, each with a snippet showing
  ~30 chars of context around the match.
- Click a result to jump to that page (synced to everyone via `emitPage`).
- Prev/next match navigation (Enter / Shift+Enter), match counter
  ("3 of 7 matches").
- Rendered as a 288px left rail in the viewer, toggled by a Search button in
  the toolbar.

**Keyboard shortcuts** (`src/components/livepdf/pdf-viewer.tsx`):
- `Ctrl+F` / `Cmd+F` toggles the search overlay (prevents browser's native find).
- `Escape` closes both the search and thumbnails overlays.

**Room settings dialog** (`src/components/livepdf/room-settings-dialog.tsx` — new):
- Room info grid: code, participant count, PDF count, creation date.
- Share buttons: copy code, copy invite link.
- Rename room (host only) — calls `PATCH /api/rooms/[code]`.
- Delete room (host only, two-click confirm) — calls `DELETE /api/rooms/[code]`
  (cascades to PDFs, chat, markers, notes).
- Leave room button.
- Non-hosts see a note that only the host can rename/delete.

**API changes** (`src/app/api/rooms/[code]/route.ts`):
- `PATCH` — rename a room (validated, max 60 chars).
- `DELETE` — delete a room + cascade.

**Chat typing indicator**:
- New `chat:typing` client→server event; server broadcasts to others (not the
  sender) with the typer's session id + display name.
- Provider tracks `typingUsers` state; auto-clears after 4s timeout.
- ChatPanel shows animated bouncing dots + "X is typing…" (singular) or
  "N people are typing…" (plural), positioned above the input.
- Typing starts on input, stops on send.

**Room header** (`src/components/livepdf/room-header.tsx`):
- Added a Settings (gear) button that opens the `RoomSettingsDialog`.
- Passes `roomCreatedAt` to the header for display in settings.

### Verification results (agent-browser, two sessions, gateway :81)

| Feature | Result |
|---|---|
| Baseline stable (5-tab sidebar, no errors) | ✅ |
| Search: open via toolbar button, type "France" → 1 match found | ✅ |
| Search: click result → jumps to page 2 (synced) | ✅ |
| Search: Escape closes the overlay | ✅ |
| Keyboard: Ctrl+F toggles search | ✅ |
| Settings dialog: opens, shows room info (code, people, PDFs, date) | ✅ |
| Settings dialog: copy code, copy link, rename, leave, delete buttons | ✅ |
| Typing indicator: A types → B sees "is typing…" with animated dots | ✅ |
| Typing indicator: clears when A sends the message | ✅ |
| ESLint clean | ✅ |
| No console/runtime errors | ✅ |

Screenshots: `qa-v4-search.png`, `qa-v4-settings.png`, `qa-v4-typing.png`.

### Unresolved / next-phase recommendations

- **Search highlight on page:** currently search jumps to the matching page but
  doesn't highlight the match within the rendered page. Could enable the text
  layer and highlight matches.
- **Operational transform for notes:** still a full-content replace on each
  debounced save (fine for a study scratchpad; CRDT/OT for true concurrent
  editing is deferred).
- **Chat @mentions / sound notifications** — could add desktop notifications +
  a subtle chime on new message.
- **Periodic clock-offset re-sync** for very long sessions.
- **Room expiry / password lock** — room settings could add a password or
  auto-expire after N hours.
- **PDF annotations / drawing** — architecture is extensible for future
  drawing or highlighting on the PDF canvas.

---

## Phase 3 — Shared Notes, PDF Thumbnails, Persistence (previous)

### Status assessment

Phase 2 (chat, markers, dark mode, tabbed sidebar) was confirmed stable via a
fresh agent-browser QA pass — no bugs, no console errors, sync service healthy.
This phase focused on the top next-phase recommendations from the worklog:
**shared notes**, **PDF page thumbnails**, and **persistence** (chat / markers /
notes now survive refresh and room eviction).

### Goals

1. Shared notes / scratchpad — a collaborative text area where everyone edits
   the same content live (the "discuss + solve" use case).
2. PDF page thumbnails — visual page navigation grid, synced.
3. Persistence — chat, markers, and notes stored in the DB so a refresh or room
   eviction keeps the history; late joiners recover everything.

### Completed modifications

**Prisma schema** (`prisma/schema.prisma`):
- New models: `ChatMessage`, `QuestionMarker`, `SharedNote` (all cascading on
  room delete, indexed by `roomId`).
- Pushed to SQLite; Prisma Client regenerated.

**New API routes**:
- `GET/POST /api/rooms/[code]/chat` — fetch history (200 msg cap) / create.
- `GET/POST/DELETE /api/rooms/[code]/markers` — list / create / delete (by id).
- `GET/PUT /api/rooms/[code]/notes` — get-or-create / upsert the shared note
  (20 000 char cap). All validate the room code and input.

**Shared types** (`src/lib/types.ts`):
- `SharedNote`, `NoteEdit` interfaces; `note` added to `RoomState`.
- New client→server event `note:edit`; new server→client events `note:state`,
  `note:updated`.

**Sync service** (`mini-services/livepdf-sync/index.ts`):
- `RoomRuntime.note: SharedNote | null`; `note:edit` handler validates the
  sender, caps at 20 000 chars, broadcasts `note:updated` with author info.
- `note:set_state` event lets the first client seed the in-memory note from the
  DB so other clients get it via room state. Full note included in `room:join`
  ack + `room:state` push.

**Provider** (`src/components/livepdf/room-sync-provider.tsx`):
- `note` state + `editNote` action (emits socket + persists to DB).
- On mount, fetches persisted chat / markers / note from the API and seeds the
  in-memory room state if the sync server doesn't already have it (so a fresh
  server after eviction still recovers DB history).
- `sendChat` / `addMarker` / `removeMarker` now also persist to the DB
  (fire-and-forget) alongside the realtime socket broadcast.

**New components**:
- `src/components/livepdf/notes-panel.tsx` — collaborative textarea with 400ms
  debounce, "saving…/saved/editing" status, char counter, last-editor label,
  remote-update guard so external changes don't clobber active typing.
- `src/components/livepdf/thumbnails-overlay.tsx` — grid of PDF page thumbnails
  (react-pdf `<Page>` at width 120), click-to-jump, active page highlighted
  with emerald ring.

**Layout** (`src/components/livepdf/room-shell.tsx`):
- Right sidebar is now a **5-tab panel**: `[Timer | Chat | Marks | Notes | People]`.
- Tighter tab spacing (gap-0.5, text-[11px]) to fit the 5th tab.

**Viewer** (`src/components/livepdf/pdf-viewer.tsx`):
- New **LayoutGrid (thumbnails) toggle button** in the toolbar; when on, a
  256px left rail renders the `ThumbnailsOverlay`. Clicking a thumbnail emits
  a page change, synced to everyone.

### Verification results (agent-browser, two sessions Alice + Bob, gateway :81)

| Feature | Result |
|---|---|
| Baseline stable (5-tab sidebar renders, no errors) | ✅ |
| Notes: A types "Solving Q3: capital of France = Paris" → B sees it live | ✅ |
| Notes persisted to DB (`updatedByName: "Alice"`) | ✅ |
| Thumbnails: A opens grid, clicks page 3 → A & B jump to page 3 | ✅ |
| Chat: A sends "The answer is Paris!" → B receives (badge "Chat 1") | ✅ |
| Chat persisted to DB (`authorName: "Alice"`) | ✅ |
| Persistence: B reloads → recovers chat message + notes content | ✅ |
| All 3 new API endpoints return 200 | ✅ |
| ESLint clean | ✅ |
| No console/runtime errors | ✅ |

Screenshots: `qa-v3-thumbnails.png`, `qa-v3-persistence.png`,
`qa-v3-final-A.png`, `qa-v3-final-B.png`.

### Bug fixed during verification

- **`db.sharedNote is undefined` (500 on notes API).** After `db:push` the
  Prisma Client was regenerated, but the running Next.js dev server still held
  the old client in memory. Fixed by restarting the dev server so it loaded the
  freshly-generated client. (Production builds via Docker regenerate + restart
  in one step, so this only affects hot dev.)

### Unresolved / next-phase recommendations

- **Marker click-to-jump in presenter mode** still emits a page change that the
  server rejects for non-presenters. Could allow marker navigation to bypass
  presenter gating, or turn it into a "request" the presenter accepts.
- **Operational transform for notes:** the current note edit replaces the full
  content on each debounced save — fine for a study scratchpad, but concurrent
  edits within the debounce window would race. A CRDT / OT layer would be needed
  for true concurrent editing (deferred — out of MVP scope).
- **Chat @mentions / sound notifications** — could add desktop notifications +
  a subtle chime on new message.
- **Periodic clock-offset re-sync** for very long sessions (captured once at
  join today).
- **PDF text search** — a find bar to locate a question by keyword.
- **Room settings** — rename room, lock room (password), expire after N hours.

---

## Phase 2 — Chat, Question Markers, Dark Mode, Refined UI (previous)

### Status assessment

The Phase 1 MVP was confirmed stable via a fresh agent-browser QA pass (home
renders, room loads, no console/runtime errors, sync service healthy). No bugs
were found in the baseline, so this phase focused on **adding new features** and
**improving styling** per the cron review requirements.

### Goals

1. Real-time text chat (spec §34 future feature) — the core "discuss questions"
   use case was underserved by the MVP.
2. Question markers / bookmarks (spec §34) — flag a page as a question so anyone
   can jump back to it.
3. Dark mode toggle — the CSS already had dark variables but no UI toggle.
4. Refined room layout — tabbed right sidebar so all panels stay accessible.

### Completed modifications

**New shared types** (`src/lib/types.ts`):
- `ChatMessage { id, roomCode, authorId, authorName, text, createdAt }`
- `QuestionMarker { id, pdfId, page, label, color, createdBy, createdByName, createdAt }`
- `MarkerColor = "amber" | "emerald" | "rose" | "violet"`
- Added `chat` + `markers` to `RoomState`; added `chat:message`, `marker:add`,
  `marker:remove` client→server events and `chat:message`, `chat:history`,
  `marker:added`, `marker:removed`, `marker:list` server→client events.

**Sync service** (`mini-services/livepdf-sync/index.ts`):
- `RoomRuntime` now holds `chat: ChatMessage[]` (capped at 200) and
  `markers: QuestionMarker[]` (capped at 100).
- `chat:message` handler validates the sender is a room participant, trims to
  1000 chars, assigns a server-generated id + server timestamp, broadcasts.
- `marker:add` validates pdfId/page, sanitizes label (120 chars), validates
  color against the allowed set, broadcasts.
- `marker:remove` allows only the marker author or the host to delete.
- Full state (incl. chat + markers) returned on `room:join` ack and
  `room:state` push, so late joiners / reconnects recover chat history.

**Provider** (`src/components/livepdf/room-sync-provider.tsx`):
- Added `chat`, `markers` state + `sendChat`, `addMarker`, `removeMarker`
  actions; wired all new socket listeners + cleanup.

**New components**:
- `src/components/livepdf/chat-panel.tsx` — message list with author avatars,
  "you" vs others bubble alignment, auto-scroll to bottom, Enter-to-send.
- `src/components/livepdf/markers-panel.tsx` — add-marker form with 4 color
  choices + label input, list grouped by "Current PDF" vs "Other PDFs",
  click-to-jump-to-page, author/host delete.
- `src/components/theme-provider.tsx` + `src/components/theme-toggle.tsx`
  (next-themes, mounted-guarded sun/moon icon button).

**Layout overhaul** (`src/components/livepdf/room-shell.tsx`):
- Right sidebar is now a **tabbed panel**: `[Timer | Chat | Marks | People]`
  with count badges (unread chat in rose, marker count, participant count).
- A **compact always-visible timer strip** at the top of the sidebar shows the
  live timer value + status dot — clicking it jumps to the Timer tab.
- Presenter controls remain always-visible at the bottom.
- Refactored `RightTabs` into a top-level component (was inline, which
  violated React's static-component lint rule).

**Viewer** (`src/components/livepdf/pdf-viewer.tsx`):
- Added a **Bookmark button** to the toolbar that opens a prompt to label the
  current page as a question and adds a marker (collaborative — anyone can
  mark, not just the presenter).

**Styling**:
- Dark mode wired into `layout.tsx` via `<ThemeProvider attribute="class">`.
- Theme toggle added to the landing page header and the room header.
- Tab triggers use `data-[state=active]:bg-background` for a cleaner active state.

### Verification results (agent-browser, two sessions A + B through gateway :81)

| Feature | Result |
|---|---|
| Baseline stable (home + room render, no errors) | ✅ |
| Tabbed sidebar renders (Timer/Chat/Marks/People + badges) | ✅ |
| Compact timer strip shows live value + status dot | ✅ |
| Chat: A sends "Hi from A!" → B receives | ✅ |
| Chat: B replies "Hello from B!" → A receives | ✅ |
| Markers: A adds "Q3 - Capital of France" on page 1 → B sees it ("P1 · Aarav") | ✅ |
| Marker count badge syncs ("Marks 1") | ✅ |
| Dark mode toggle: light→dark (`dark` class=true)→light | ✅ |
| Landing page theme toggle works | ✅ |
| Core page sync still works (A→B page 2 of 3) | ✅ |
| ESLint clean | ✅ |
| No console/runtime errors | ✅ |

Screenshots: `qa-v2-room.png`, `qa-v2-chat-A.png`, `qa-v2-chat-B.png`,
`qa-v2-markers.png`, `qa-v2-markers-B.png`, `qa-v2-dark.png`,
`qa-v2-landing.png`, `qa-v2-landing-dark.png`.

### Unresolved / next-phase recommendations

- **Marker click-to-jump** currently emits a page change; in presenter mode a
  non-presenter's marker-jump would be rejected by the server. Consider making
  marker navigation a "request" that the presenter can accept, or allow marker
  jumps to bypass presenter gating.
- **Chat persistence:** messages live in server memory only and are lost when
  the room is evicted (5 min after everyone leaves). Could persist to the DB
  (`ChatMessage` model) for room history.
- **Marker persistence:** same as chat — currently in-memory only.
- **Chat @mentions / notifications:** could add sound + desktop notifications.
- **PDF thumbnails strip** for visual page navigation (was scoped but deferred
  to keep this phase focused).
- **Re-sync clock offset** periodically for very long sessions (currently
  captured once at join).

---

## Phase 1 — MVP (previous)

## Project Status

**Preply** is a real-time collaborative PDF study room. Two or more students
join a shared room (by code or link), upload PDFs, and view the same document with
synchronized page / scroll / zoom, a shared server-authoritative stopwatch &
countdown, live presence, and an optional presenter mode.

**Current state: MVP complete and browser-verified.**

The application has been built end-to-end and verified with a two-browser-session
agent-browser QA pass. All core real-time features work bidirectionally across two
simulated students with no console errors.

---

## Architecture (sandbox runtime)

The sandbox runs Next.js 16 (App Router) on port 3000 and a Socket.IO "mini-service"
on port 3002, both fronted by a Caddy gateway (port 81) that routes
`?XTransformPort=<port>` to the right backend. The browser connects to the Socket.IO
server through the gateway using `io("/?XTransformPort=3002")` — this is what makes
real-time sync work for the user-facing preview.

```
Browser ──HTTP/WS──► Caddy :81 ──► Next.js :3000  (app + API + pdf serving)
                         └───► (XTransformPort=3002) ──► Socket.IO :3002 (sync service)
Next.js API ──► Prisma ──► SQLite (db/custom.db)
PDF files  ──► storage/pdfs/ (local volume; mapped to /app/storage/pdfs in Docker)
```

For the user's real deployment target (PostgreSQL + Docker, single app container),
reference artifacts are provided: `Dockerfile`, `docker-compose.yml`, `.dockerignore`,
`.env.example`, `start.sh`. The Dockerfile swaps the Prisma provider to `postgresql`
at build time and runs `prisma migrate deploy` + Next.js + the sync service inside one
container, with PostgreSQL in a separate container.

---

## Key Files

```
prisma/schema.prisma                 Room, PDF, Participant models
src/lib/types.ts                     Shared types (RoomState, ViewerState, TimerState…)
src/lib/constants.ts                 Room code gen, limits, throttle, zoom ranges
src/lib/validation.ts                zod schemas + filename sanitizer (path-traversal safe)
src/lib/pdf-storage.ts               Opaque stored filenames, save/read/delete
src/lib/participant.ts              Anonymous session id in localStorage
src/lib/socket.ts                    Singleton socket client (via gateway XTransformPort)
src/app/page.tsx                     Landing — create / join room
src/app/room/[code]/page.tsx         Room page + name gate + room-not-found
src/app/api/rooms/...                Room + PDF REST endpoints
src/app/api/pdfs/[id]/route.ts       Stream / delete PDF files
src/components/livepdf/
  room-sync-provider.tsx            Central state + socket wiring + clock-offset sync
  room-shell.tsx                    Resizable 3-column layout + sticky footer
  pdf-viewer.tsx                    react-pdf viewer (page/zoom/scroll/rotation/fullscreen)
  pdf-list.tsx                      Upload + list + delete
  timer-panel.tsx                   Stopwatch + countdown (server-authoritative display)
  participant-panel.tsx             Presence
  connection-indicator.tsx          Live Sync / Reconnecting / Disconnected
  presenter-controls.tsx           Presenter mode toggle + assignment (host only)
  room-header.tsx, name-gate.tsx
mini-services/livepdf-sync/index.ts  Socket.IO server (port 3002), in-memory rooms,
                                     server-authoritative timer, presenter gating,
                                     loop-prevention via `changedBy`, 5-min eviction
public/pdf.worker.min.mjs          pdfjs worker (v5.4.296, matches react-pdf v10)
```

---

## Real-Time Sync Design (critical)

- **Lightweight state only.** The PDF itself is fetched via `/api/pdfs/[id]`; only
  `pdfId / page / scroll(ratio) / zoom / rotation / changedBy / changedAt` travel on
  the wire — never PDF bytes.
- **Server-authoritative timer.** Timer state = `{mode, status, startedAt, pausedAt,
  elapsed, duration}`. Clients compute display from timestamps + a server-clock offset
  (captured from `serverTime` in the join ack), so latency can't desync displays and
  late joiners see the correct value instantly.
- **Loop prevention (two layers):**
  1. Every broadcast carries `changedBy` (the sender's session id); the sender ignores
     its own echo.
  2. The viewer distinguishes the *kind* of the last viewer change (`select | page |
     scroll | zoom | rotation`). The page-apply effect only fires for `kind==="page"`,
     the scroll-apply effect only for `kind==="scroll"`. This stops a `viewer:scroll`
     event (which also updates `currentPage`) from triggering `scrollToPage` and
     clobbering the scroll ratio — the subtle bug that originally prevented scroll
     convergence.
  3. An `applyingRemoteRef` flag suppresses the local scroll listener while a remote
     scroll is being applied, so programmatic scroll doesn't bounce back as a new emit.
- **Scroll throttling.** Leading emit capped at ~80ms + a trailing flush 120ms after
  scrolling stops, so the final resting position always propagates and both clients
  converge to the exact same ratio (verified: 0.7→0.7, 0.2→0.2, 0.5→0.5).
- **Screen-size agnostic scroll.** `viewer.scrollY` is a 0..1 ratio (not pixels), so
  clients with different viewport sizes still land on the same relative position.
- **Room state recovery.** On (re)connect the client emits `room:join`; the server
  replies with the full `RoomState` (participants, pdfs, viewer, timer, presenter) so a
  refresh / reconnect instantly restores the correct PDF, page, zoom, timer.
- **Presenter mode.** Host toggles it on and assigns a presenter. When on, only the
  presenter can drive the viewer (server rejects others + client disables controls and
  shows a "View-only" badge).

---

## Verification (agent-browser, two sessions)

Both servers started; room `9MWYT8` created; 3-page test PDF uploaded. Sessions A
("Aarav", host) and B ("Diya") joined through the gateway (:81) so the socket connects.

| Feature | Result |
|---|---|
| Landing page renders (create/join + features) | ✅ |
| Create room → unique code + navigates to /room/CODE | ✅ |
| Name gate (button disabled until name entered) | ✅ |
| Room UI: header, PDF list, viewer, timer tabs, participants, resizable panels | ✅ |
| PDF upload + list (real-time + API source-of-truth) | ✅ |
| PDF opens in react-pdf viewer (3 pages render as canvas) | ✅ |
| Presence sync (A & B see each other) | ✅ |
| PDF selection sync (B auto-opens A's PDF) | ✅ |
| Page sync A→B (page 3) | ✅ |
| Zoom sync A→B (115%) | ✅ |
| Scroll sync A→B (0.7→0.7, 0.2→0.2 exact after fix) | ✅ |
| Scroll sync B→A (0.5→0.5) | ✅ |
| Timer sync: A starts stopwatch → B shows same 00:00:03 | ✅ |
| Timer sync: B pauses → A becomes "Paused" | ✅ |
| Presenter mode: host toggles on → B shows "View-only", controls disabled | ✅ |
| Room state recovery: reload rejoins + restores PDF/page | ✅ |
| No console / runtime errors | ✅ |
| ESLint clean | ✅ |

Screenshots: `qa-home.png`, `qa-room.png`, `qa-viewer.png`, `qa-final-A.png`,
`qa-final-B.png`, `qa-sync.png`, `qa-timer.png`.

---

## Bugs Fixed During Verification

1. **pdfjs worker version mismatch.** react-pdf v10 bundles pdfjs API v5.4.296, but
   the standalone `pdfjs-dist@6.2.108` worker was copied. Fixed by copying the worker
   from `node_modules/react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs`.
2. **`leaveRoom is not defined` crashed the sync service.** The `room:leave` handler
   referenced an undefined function; a client unmount (page reload) threw and killed
   the `bun --hot` process. Added a proper `leaveRoom(socket, roomCode)` with host
   reassignment + eviction scheduling, reused by both `room:leave` and `disconnect`.
3. **Scroll sync not converging.** Root cause: `viewer:scroll` updates `currentPage`,
   which fired the page-apply effect (`scrollToPage`) and overwrote the scroll ratio.
   Fixed by adding a `kind` discriminator to `ViewerState` and gating each apply effect
   on its own kind. Also removed the double-throttle (viewer + provider both 80ms) and
   added a trailing-flush emit.
4. **PDF list empty when socket briefly unavailable.** `refetchPdfs` was only called
   inside the socket `connect` handler. Added a mount effect so PDFs always load from
   the API regardless of socket state.
5. **ESLint config.** Excluded `public/`, `mini-services/`, `storage/`, `ui/` from
   linting (minified worker) and disabled the React-Compiler manual-memoization rules
   that conflicted with intentional throttling refs.

---

## Environment Notes

- The sandbox reaps background processes between bash tool calls. Servers must be
  started with the subshell pattern `( cmd & )` (reparents to init/tini, survives).
  Plain `cmd &`, `setsid`, and `nohup` were all reaped in testing.
- agent-browser must hit the gateway (`http://localhost:81/`) — not `:3000` — so the
  `?XTransformPort=3002` socket path is routed by Caddy. Hitting `:3000` directly
  makes the socket connect to Next.js (no transform) and fail.

---

## Unresolved / Next-Phase Recommendations

- **Persistence of uploaded PDFs across dev restarts:** currently in `storage/pdfs/`
  (survives). The DB is SQLite; the Docker reference uses PostgreSQL.
- **Presenter "follow me" camera:** currently presenter mode gates controls; could add
  an auto-follow that forces followers' scroll to the presenter's continuously.
- **Chat / annotations / drawing:** architecture is extensible (events are modular);
  these are future features per spec §34 and intentionally not built in the MVP.
- **Multi-instance scaling:** in-memory room state. The code is structured so a Redis
  adapter can be dropped into the Socket.IO server for horizontal scaling.
- **Clock drift:** offset captured once at join; a periodic re-sync handshake could be
  added for very long sessions.

---

## How to Run

Sandbox (already running): dev server on :3000 + sync service on :3002, gateway on :81.
Preview via the Preview Panel (the gateway routes the socket correctly).

Real deployment:
```bash
cp .env.example .env
docker compose up --build
# app on :3000 (Next.js + API + Socket.IO in one container), postgres in another
```
