// Shared types for Preply — mirrored on the socket server (mini-service).

export type TimerMode = "stopwatch" | "countdown";
export type TimerStatus = "idle" | "running" | "paused" | "finished";

export interface TimerState {
  mode: TimerMode;
  status: TimerStatus;
  // server epoch ms when the timer started/resumed ticking from `elapsed` baseline
  startedAt: number | null;
  // server epoch ms when paused (snapshot of elapsed)
  pausedAt: number | null;
  // baseline elapsed ms accumulated before current running segment
  elapsed: number;
  // countdown target duration in ms (null for stopwatch)
  duration: number | null;
}

export interface Participant {
  id: string;
  sessionId: string;
  displayName: string;
  isPresenter: boolean;
  isHost: boolean;
  joinedAt: number;
}

export type ViewerChangeKind = "select" | "page" | "scroll" | "zoom" | "rotation" | null;

export interface ViewerState {
  pdfId: string | null;
  currentPage: number;
  totalPages: number;
  scrollX: number;
  scrollY: number;
  zoom: number;
  rotation: number;
  kind: ViewerChangeKind;
  changedBy: string | null; // participant id who last changed
  changedAt: number;
}

export interface RoomPdfMeta {
  id: string;
  originalName: string;
  fileSize: number;
  uploadedByName: string | null;
  createdAt: string;
}

// --- Chat ---

export interface ChatMessage {
  id: string;
  roomCode: string;
  authorId: string; // sessionId
  authorName: string;
  text: string;
  createdAt: number; // server epoch ms
}

// --- Question markers ---

export type MarkerColor = "amber" | "emerald" | "rose" | "violet";

export interface QuestionMarker {
  id: string;
  pdfId: string;
  page: number;
  label: string;
  color: MarkerColor;
  createdBy: string; // sessionId
  createdByName: string;
  createdAt: number; // server epoch ms
}

// --- Shared notes ---

export interface SharedNote {
  content: string;
  updatedAt: number;
  updatedBy: string | null;
  updatedByName: string | null;
}

export interface NoteEdit {
  content: string;
  updatedBy: string;
  updatedByName: string;
  updatedAt: number;
}

// --- PDF annotations ---

export type AnnotationTool = "highlight" | "pen" | "rect" | "erase";
export type AnnotationColor = "amber" | "emerald" | "rose" | "violet" | "sky";

export interface Annotation {
  id: string;
  pdfId: string;
  page: number;
  tool: AnnotationTool;
  color: AnnotationColor;
  // normalized 0..1 coordinates relative to page size
  points: { x: number; y: number }[];
  createdBy: string;
  createdByName: string;
  createdAt: number;
}

export interface RoomState {
  roomCode: string;
  serverTime: number;
  presenterEnabled: boolean;
  presenterId: string | null;
  participants: Participant[];
  pdfs: RoomPdfMeta[];
  viewer: ViewerState;
  timer: TimerState;
  chat: ChatMessage[];
  markers: QuestionMarker[];
  note: SharedNote | null;
  annotations: Annotation[];
}

// --- Socket event payloads ---

export interface ClientToServerEvents {
  "room:join": (payload: { roomCode: string; sessionId: string; displayName: string }, ack: (res: { ok: boolean; state?: RoomState; error?: string }) => void) => void;
  "room:leave": (payload: { roomCode: string }) => void;
  "room:request_state": (payload: { roomCode: string }, ack: (res: { ok: boolean; state?: RoomState; error?: string }) => void) => void;

  "ping": (payload: { t: number }, ack: (res: { t: number; serverTime: number }) => void) => void;
  "participant:kick": (payload: { roomCode: string; sessionId: string }) => void;

  "pdf:selected": (payload: { roomCode: string; pdfId: string | null }) => void;
  "pdf:deleted": (payload: { roomCode: string; pdfId: string }) => void;

  "viewer:page": (payload: { roomCode: string; page: number; totalPages: number }) => void;
  "viewer:scroll": (payload: { roomCode: string; scrollX: number; scrollY: number; page: number }) => void;
  "viewer:zoom": (payload: { roomCode: string; zoom: number }) => void;
  "viewer:rotation": (payload: { roomCode: string; rotation: number }) => void;

  "timer:start": (payload: { roomCode: string; mode: TimerMode; duration?: number }) => void;
  "timer:pause": (payload: { roomCode: string }) => void;
  "timer:resume": (payload: { roomCode: string }) => void;
  "timer:reset": (payload: { roomCode: string }) => void;
  "timer:request_state": (payload: { roomCode: string }, ack: (res: { ok: boolean; state?: TimerState; error?: string }) => void) => void;

  "presenter:set": (payload: { roomCode: string; presenterId: string | null }) => void;
  "presenter:toggle_mode": (payload: { roomCode: string; enabled: boolean }) => void;

  "chat:message": (payload: { roomCode: string; text: string }) => void;
  "chat:typing": (payload: { roomCode: string; isTyping: boolean }) => void;

  "marker:add": (payload: { roomCode: string; pdfId: string; page: number; label: string; color: MarkerColor }) => void;
  "marker:remove": (payload: { roomCode: string; markerId: string }) => void;

  "note:edit": (payload: { roomCode: string; content: string }) => void;

  "annotation:add": (payload: { roomCode: string; pdfId: string; page: number; tool: AnnotationTool; color: AnnotationColor; points: { x: number; y: number }[] }) => void;
  "annotation:remove": (payload: { roomCode: string; annotationId: string }) => void;
  "annotation:clear_page": (payload: { roomCode: string; pdfId: string; page: number }) => void;
}

export interface ServerToClientEvents {
  "room:state": (state: RoomState) => void;
  "participant:joined": (participant: Participant) => void;
  "participant:left": (participantId: string) => void;
  "participant:list": (participants: Participant[]) => void;

  "pdf:uploaded": (pdf: RoomPdfMeta) => void;
  "pdf:selected": (payload: { pdfId: string | null; changedBy: string }) => void;
  "pdf:deleted": (payload: { pdfId: string }) => void;

  "viewer:page": (payload: { page: number; totalPages: number; changedBy: string; changedAt: number }) => void;
  "viewer:scroll": (payload: { scrollX: number; scrollY: number; page: number; changedBy: string; changedAt: number }) => void;
  "viewer:zoom": (payload: { zoom: number; changedBy: string; changedAt: number }) => void;
  "viewer:rotation": (payload: { rotation: number; changedBy: string; changedAt: number }) => void;

  "timer:state": (state: TimerState) => void;

  "presenter:state": (payload: { enabled: boolean; presenterId: string | null }) => void;

  "chat:message": (message: ChatMessage) => void;
  "chat:history": (messages: ChatMessage[]) => void;
  "chat:typing": (payload: { sessionId: string; displayName: string; isTyping: boolean }) => void;

  "marker:added": (marker: QuestionMarker) => void;
  "marker:removed": (payload: { markerId: string }) => void;
  "marker:list": (markers: QuestionMarker[]) => void;

  "note:state": (note: SharedNote) => void;
  "note:updated": (edit: NoteEdit) => void;

  "annotation:added": (annotation: Annotation) => void;
  "annotation:removed": (payload: { annotationId: string }) => void;
  "annotation:page_cleared": (payload: { pdfId: string; page: number }) => void;
  "annotation:list": (annotations: Annotation[]) => void;

  "system:message": (payload: { type: "info" | "warn" | "error"; message: string }) => void;
  "system:kicked": (payload: { reason: string }) => void;
}

export function emptyTimerState(): TimerState {
  return {
    mode: "stopwatch",
    status: "idle",
    startedAt: null,
    pausedAt: null,
    elapsed: 0,
    duration: null,
  };
}

export function emptyViewerState(): ViewerState {
  return {
    pdfId: null,
    currentPage: 1,
    totalPages: 0,
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
    rotation: 0,
    kind: null,
    changedBy: null,
    changedAt: 0,
  };
}

/**
 * Compute the live elapsed milliseconds from a server-authoritative TimerState.
 * Uses the server clock timestamp embedded in state plus a client/server clock
 * offset to remain accurate even under network latency.
 */
export function computeElapsedMs(state: TimerState, clockOffsetMs: number): number {
  if (state.status === "running" && state.startedAt != null) {
    const now = Date.now() + clockOffsetMs;
    return state.elapsed + Math.max(0, now - state.startedAt);
  }
  return state.elapsed;
}

export function formatTimer(ms: number, mode: TimerMode): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (mode === "countdown") {
    if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  }
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
