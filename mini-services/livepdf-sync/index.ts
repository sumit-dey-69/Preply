// LivePDF Room — Real-time sync service (Socket.IO)
// Port: 3002 (exposed via Caddy gateway using ?XTransformPort=3002)
//
// Responsibilities:
//  - Maintain in-memory room runtime state (participants, viewer, timer).
//  - Server-authoritative timer (stopwatch + countdown) so all clients stay in sync
//    even under latency; late joiners compute the correct display from timestamps.
//  - Broadcast lightweight viewer state (page/scroll/zoom/rotation) — never PDF bytes.
//  - Presenter mode gating.
//  - Sync-loop prevention: every broadcast carries `changedBy` (participant id);
//    clients ignore events whose changedBy === their own id.

import { createServer } from "http";
import { Server } from "socket.io";
import {
  emptyTimerState,
  emptyViewerState,
  computeElapsedMs,
} from "../../src/lib/types.js";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Participant,
  RoomState,
  TimerState,
  ViewerState,
  RoomPdfMeta,
  ChatMessage,
  QuestionMarker,
  MarkerColor,
  SharedNote,
  Annotation,
  AnnotationTool,
  AnnotationColor,
} from "../../src/lib/types.js";

interface RoomRuntime {
  roomCode: string;
  hostId: string | null; // sessionId of the host (first joiner)
  presenterEnabled: boolean;
  presenterId: string | null; // sessionId
  participants: Map<string, Participant>; // key: socket.id
  sessionIdBySocket: Map<string, string>; // socket.id -> sessionId
  socketBySessionId: Map<string, string>; // sessionId -> socket.id
  pdfs: RoomPdfMeta[];
  viewer: ViewerState;
  timer: TimerState;
  chat: ChatMessage[];
  markers: QuestionMarker[];
  note: SharedNote | null;
  annotations: Annotation[];
}

const MAX_CHAT_MESSAGES = 200;
const MAX_MARKERS = 100;
const MAX_NOTE_LENGTH = 20000;
const MAX_ANNOTATIONS = 500;
const MAX_ANNOTATION_POINTS = 2000;

const rooms = new Map<string, RoomRuntime>();

function getOrCreateRoom(roomCode: string): RoomRuntime {
  let room = rooms.get(roomCode);
  if (!room) {
    room = {
      roomCode,
      hostId: null,
      presenterEnabled: false,
      presenterId: null,
      participants: new Map(),
      sessionIdBySocket: new Map(),
      socketBySessionId: new Map(),
      pdfs: [],
      viewer: emptyViewerState(),
      timer: emptyTimerState(),
      chat: [],
      markers: [],
      note: null,
      annotations: [],
    };
    rooms.set(roomCode, room);
  }
  return room;
}

function toRoomState(room: RoomRuntime): RoomState {
  return {
    roomCode: room.roomCode,
    serverTime: Date.now(),
    presenterEnabled: room.presenterEnabled,
    presenterId: room.presenterId,
    participants: Array.from(room.participants.values()),
    pdfs: room.pdfs,
    viewer: { ...room.viewer },
    timer: { ...room.timer },
    chat: room.chat,
    markers: room.markers,
    note: room.note,
    annotations: room.annotations,
  };
}

function findParticipantBySocket(room: RoomRuntime, socketId: string): Participant | undefined {
  return room.participants.get(socketId);
}

function isPresenter(room: RoomRuntime, socketId: string): boolean {
  if (!room.presenterEnabled) return true; // shared mode — everyone can control
  const p = findParticipantBySocket(room, socketId);
  if (!p) return false;
  return p.sessionId === room.presenterId;
}

function broadcastTimer(room: RoomRuntime) {
  io.to(room.roomCode).emit("timer:state", { ...room.timer });
}

function broadcastParticipantList(room: RoomRuntime) {
  io.to(room.roomCode).emit("participant:list", Array.from(room.participants.values()));
}

function broadcastPresenterState(room: RoomRuntime) {
  io.to(room.roomCode).emit("presenter:state", {
    enabled: room.presenterEnabled,
    presenterId: room.presenterId,
  });
}

function broadcastRoomState(room: RoomRuntime) {
  io.to(room.roomCode).emit("room:state", toRoomState(room));
}

function leaveRoom(socket: any, roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const sessionId = room.sessionIdBySocket.get(socket.id);
  const participant = room.participants.get(socket.id);
  if (participant) {
    room.participants.delete(socket.id);
    room.sessionIdBySocket.delete(socket.id);
    if (sessionId) room.socketBySessionId.delete(sessionId);
    socket.to(roomCode).emit("participant:left", socket.id);
    broadcastParticipantList(room);
    console.log(`[sync] ${participant.displayName} left ${roomCode}`);

    // host reassignment on explicit leave
    if (sessionId === room.hostId) {
      const next = Array.from(room.participants.values())[0];
      if (next) {
        room.hostId = next.sessionId;
        if (room.presenterEnabled && room.presenterId === sessionId) {
          room.presenterId = next.sessionId;
        }
        for (const part of room.participants.values()) {
          part.isHost = part.sessionId === room.hostId;
          part.isPresenter = room.presenterEnabled ? part.sessionId === room.presenterId : true;
        }
        broadcastParticipantList(room);
        broadcastPresenterState(room);
      } else {
        scheduleRoomEviction(roomCode);
      }
    }
  }
  socket.leave(roomCode);
}

// --- HTTP + Socket.IO server ---

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ service: "livepdf-sync", ok: true, rooms: rooms.size }));
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on("connection", (socket) => {
  console.log(`[sync] connected ${socket.id}`);

  socket.on("room:join", (payload, ack) => {
    try {
      const { roomCode, sessionId, displayName } = payload;
      if (!roomCode || !sessionId || !displayName) {
        ack({ ok: false, error: "Missing join payload" });
        return;
      }
      const room = getOrCreateRoom(roomCode);
      cancelRoomEviction(roomCode);

      // If this session was already connected (reconnect / second tab), remove old socket binding.
      const prevSocketId = room.socketBySessionId.get(sessionId);
      if (prevSocketId && prevSocketId !== socket.id) {
        room.participants.delete(prevSocketId);
        room.sessionIdBySocket.delete(prevSocketId);
      }

      const isHost = room.hostId == null;
      if (isHost) {
        room.hostId = sessionId;
        room.presenterId = sessionId;
      }

      const participant: Participant = {
        id: socket.id,
        sessionId,
        displayName,
        isPresenter: sessionId === room.presenterId,
        isHost: sessionId === room.hostId,
        joinedAt: Date.now(),
      };

      room.participants.set(socket.id, participant);
      room.sessionIdBySocket.set(socket.id, sessionId);
      room.socketBySessionId.set(sessionId, socket.id);

      socket.join(roomCode);

      // Send current state to the joining client.
      ack({ ok: true, state: toRoomState(room) });

      // Notify others.
      socket.to(roomCode).emit("participant:joined", participant);
      broadcastParticipantList(room);
      broadcastPresenterState(room);

      console.log(`[sync] ${displayName} joined ${roomCode} (${room.participants.size} total)`);
    } catch (e) {
      console.error("[sync] room:join error", e);
      ack({ ok: false, error: "Internal error" });
    }
  });

  socket.on("room:leave", (payload) => {
    leaveRoom(socket, payload.roomCode);
  });

  // --- latency / ping ---
  socket.on("ping", (payload: { t: number }, ack: (res: { t: number; serverTime: number }) => void) => {
    ack({ t: payload.t, serverTime: Date.now() });
  });

  // --- participant kick (host only) ---
  socket.on("participant:kick", (payload: { roomCode: string; sessionId: string }) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const kicker = findParticipantBySocket(room, socket.id);
    if (!kicker || kicker.sessionId !== room.hostId) {
      socket.emit("system:message", { type: "warn", message: "Only the host can kick participants." });
      return;
    }
    const targetSocketId = room.socketBySessionId.get(payload.sessionId);
    if (!targetSocketId) return;
    const target = room.participants.get(targetSocketId);
    if (!target) return;
    // notify the kicked user
    io.to(targetSocketId).emit("system:kicked", { reason: "You were removed by the host." });
    // force disconnect
    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) targetSocket.disconnect(true);
    console.log(`[sync] ${target.displayName} was kicked from ${room.roomCode}`);
  });

  socket.on("room:request_state", (payload, ack) => {
    const room = rooms.get(payload.roomCode);
    if (!room) {
      ack({ ok: false, error: "Room not active" });
      return;
    }
    ack({ ok: true, state: toRoomState(room) });
  });

  // --- PDF selection ---
  socket.on("pdf:selected", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    if (!isPresenter(room, socket.id)) {
      socket.emit("system:message", { type: "warn", message: "Only the presenter can change the PDF." });
      return;
    }
    const p = findParticipantBySocket(room, socket.id);
    room.viewer.pdfId = payload.pdfId;
    room.viewer.currentPage = 1;
    room.viewer.scrollX = 0;
    room.viewer.scrollY = 0;
    room.viewer.zoom = 1;
    room.viewer.rotation = 0;
    room.viewer.changedBy = p?.sessionId ?? null;
    room.viewer.changedAt = Date.now();
    io.to(payload.roomCode).emit("pdf:selected", {
      pdfId: payload.pdfId,
      changedBy: p?.sessionId ?? "",
    });
  });

  socket.on("pdf:deleted", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    room.pdfs = room.pdfs.filter((p) => p.id !== payload.pdfId);
    if (room.viewer.pdfId === payload.pdfId) {
      room.viewer.pdfId = null;
      room.viewer.currentPage = 1;
      room.viewer.totalPages = 0;
    }
    io.to(payload.roomCode).emit("pdf:deleted", { pdfId: payload.pdfId });
  });

  // --- Viewer sync ---
  socket.on("viewer:page", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    if (!isPresenter(room, socket.id)) return;
    const p = findParticipantBySocket(room, socket.id);
    const now = Date.now();
    room.viewer.currentPage = Math.max(1, payload.page);
    room.viewer.totalPages = payload.totalPages || room.viewer.totalPages;
    room.viewer.changedBy = p?.sessionId ?? null;
    room.viewer.changedAt = now;
    io.to(payload.roomCode).emit("viewer:page", {
      page: room.viewer.currentPage,
      totalPages: room.viewer.totalPages,
      changedBy: p?.sessionId ?? "",
      changedAt: now,
    });
  });

  socket.on("viewer:scroll", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    if (!isPresenter(room, socket.id)) return;
    const p = findParticipantBySocket(room, socket.id);
    const now = Date.now();
    room.viewer.scrollX = payload.scrollX;
    room.viewer.scrollY = payload.scrollY;
    room.viewer.currentPage = payload.page || room.viewer.currentPage;
    room.viewer.changedBy = p?.sessionId ?? null;
    room.viewer.changedAt = now;
    io.to(payload.roomCode).emit("viewer:scroll", {
      scrollX: payload.scrollX,
      scrollY: payload.scrollY,
      page: payload.page || room.viewer.currentPage,
      changedBy: p?.sessionId ?? "",
      changedAt: now,
    });
  });

  socket.on("viewer:zoom", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    if (!isPresenter(room, socket.id)) return;
    const p = findParticipantBySocket(room, socket.id);
    const now = Date.now();
    room.viewer.zoom = payload.zoom;
    room.viewer.changedBy = p?.sessionId ?? null;
    room.viewer.changedAt = now;
    io.to(payload.roomCode).emit("viewer:zoom", {
      zoom: payload.zoom,
      changedBy: p?.sessionId ?? "",
      changedAt: now,
    });
  });

  socket.on("viewer:rotation", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    if (!isPresenter(room, socket.id)) return;
    const p = findParticipantBySocket(room, socket.id);
    const now = Date.now();
    room.viewer.rotation = payload.rotation;
    room.viewer.changedBy = p?.sessionId ?? null;
    room.viewer.changedAt = now;
    io.to(payload.roomCode).emit("viewer:rotation", {
      rotation: payload.rotation,
      changedBy: p?.sessionId ?? "",
      changedAt: now,
    });
  });

  // --- Timer (server-authoritative) ---
  socket.on("timer:start", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const now = Date.now();
    const mode = payload.mode;
    const duration = mode === "countdown" ? (payload.duration ?? 0) : null;
    room.timer = {
      mode,
      status: "running",
      startedAt: now,
      pausedAt: null,
      elapsed: 0,
      duration,
    };
    broadcastTimer(room);
    console.log(`[sync] timer start ${mode} in ${room.roomCode}`);
  });

  socket.on("timer:pause", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const t = room.timer;
    if (t.status !== "running") return;
    const elapsed = computeElapsedMs(t, 0);
    t.status = "paused";
    t.pausedAt = Date.now();
    t.elapsed = elapsed;
    t.startedAt = null;
    broadcastTimer(room);
  });

  socket.on("timer:resume", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const t = room.timer;
    if (t.status !== "paused") return;
    t.status = "running";
    t.startedAt = Date.now();
    t.pausedAt = null;
    broadcastTimer(room);
  });

  socket.on("timer:reset", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const mode = room.timer.mode;
    room.timer = emptyTimerState();
    room.timer.mode = mode;
    broadcastTimer(room);
  });

  socket.on("timer:request_state", (payload, ack) => {
    const room = rooms.get(payload.roomCode);
    if (!room) {
      ack({ ok: false, error: "Room not active" });
      return;
    }
    ack({ ok: true, state: { ...room.timer } });
  });

  // --- Presenter mode ---
  socket.on("presenter:set", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const p = findParticipantBySocket(room, socket.id);
    // Only host can reassign presenter (or anyone if presenter mode is off).
    if (!p || p.sessionId !== room.hostId) {
      socket.emit("system:message", { type: "warn", message: "Only the host can change the presenter." });
      return;
    }
    room.presenterEnabled = true;
    room.presenterId = payload.presenterId;
    for (const part of room.participants.values()) {
      part.isPresenter = part.sessionId === room.presenterId;
    }
    broadcastParticipantList(room);
    broadcastPresenterState(room);
  });

  socket.on("presenter:toggle_mode", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const p = findParticipantBySocket(room, socket.id);
    if (!p || p.sessionId !== room.hostId) {
      socket.emit("system:message", { type: "warn", message: "Only the host can toggle presenter mode." });
      return;
    }
    room.presenterEnabled = payload.enabled;
    if (payload.enabled && !room.presenterId) {
      room.presenterId = room.hostId;
    }
    for (const part of room.participants.values()) {
      part.isPresenter = room.presenterEnabled ? part.sessionId === room.presenterId : true;
    }
    broadcastParticipantList(room);
    broadcastPresenterState(room);
  });

  // --- Chat ---
  socket.on("chat:message", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const p = findParticipantBySocket(room, socket.id);
    if (!p) return;
    const text = (payload.text || "").trim().slice(0, 1000);
    if (!text) return;
    const msg: ChatMessage = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      roomCode: room.roomCode,
      authorId: p.sessionId,
      authorName: p.displayName,
      text,
      createdAt: Date.now(),
    };
    room.chat.push(msg);
    if (room.chat.length > MAX_CHAT_MESSAGES) {
      room.chat.splice(0, room.chat.length - MAX_CHAT_MESSAGES);
    }
    io.to(room.roomCode).emit("chat:message", msg);
  });

  socket.on("chat:typing", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const p = findParticipantBySocket(room, socket.id);
    if (!p) return;
    socket.to(room.roomCode).emit("chat:typing", {
      sessionId: p.sessionId,
      displayName: p.displayName,
      isTyping: !!payload.isTyping,
    });
  });

  // --- Question markers ---
  socket.on("marker:add", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const p = findParticipantBySocket(room, socket.id);
    if (!p) return;
    const label = (payload.label || "").trim().slice(0, 120);
    if (!payload.pdfId || !payload.page || payload.page < 1) return;
    const validColors: MarkerColor[] = ["amber", "emerald", "rose", "violet"];
    const color: MarkerColor = validColors.includes(payload.color) ? payload.color : "amber";
    const marker: QuestionMarker = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      pdfId: payload.pdfId,
      page: payload.page,
      label: label || `Question on page ${payload.page}`,
      color,
      createdBy: p.sessionId,
      createdByName: p.displayName,
      createdAt: Date.now(),
    };
    room.markers.push(marker);
    if (room.markers.length > MAX_MARKERS) {
      room.markers.splice(0, room.markers.length - MAX_MARKERS);
    }
    io.to(room.roomCode).emit("marker:added", marker);
  });

  socket.on("marker:remove", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const p = findParticipantBySocket(room, socket.id);
    if (!p) return;
    const marker = room.markers.find((m) => m.id === payload.markerId);
    if (!marker) return;
    // author or host can remove
    if (marker.createdBy !== p.sessionId && p.sessionId !== room.hostId) {
      socket.emit("system:message", { type: "warn", message: "Only the marker author or host can remove it." });
      return;
    }
    room.markers = room.markers.filter((m) => m.id !== payload.markerId);
    io.to(room.roomCode).emit("marker:removed", { markerId: payload.markerId });
  });

  // --- Shared notes ---
  // Client pushes the persisted note state into memory after fetching from the API
  // (first joiner seeds it so everyone else gets it via room state).
  socket.on("note:set_state" as any, (payload: any) => {
    const room = rooms.get(payload?.roomCode);
    if (!room) return;
    if (room.note) return; // already seeded
    room.note = {
      content: typeof payload.content === "string" ? payload.content : "",
      updatedAt: typeof payload.updatedAt === "number" ? payload.updatedAt : Date.now(),
      updatedBy: payload.updatedBy ?? null,
      updatedByName: payload.updatedByName ?? null,
    };
  });

  socket.on("note:edit", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const p = findParticipantBySocket(room, socket.id);
    if (!p) return;
    const content = (payload.content || "").slice(0, MAX_NOTE_LENGTH);
    const now = Date.now();
    room.note = {
      content,
      updatedAt: now,
      updatedBy: p.sessionId,
      updatedByName: p.displayName,
    };
    io.to(room.roomCode).emit("note:updated", {
      content,
      updatedBy: p.sessionId,
      updatedByName: p.displayName,
      updatedAt: now,
    });
  });

  // --- Annotations ---
  const VALID_TOOLS: AnnotationTool[] = ["highlight", "pen", "rect", "erase"];
  const VALID_ANN_COLORS: AnnotationColor[] = ["amber", "emerald", "rose", "violet", "sky"];

  socket.on("annotation:add", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const p = findParticipantBySocket(room, socket.id);
    if (!p) return;
    if (!payload.pdfId || typeof payload.page !== "number" || payload.page < 1) return;
    const tool: AnnotationTool = VALID_TOOLS.includes(payload.tool) ? payload.tool : "highlight";
    const color: AnnotationColor = VALID_ANN_COLORS.includes(payload.color) ? payload.color : "amber";
    if (!Array.isArray(payload.points) || payload.points.length === 0) return;
    // sanitize + cap points
    const points = payload.points
      .slice(0, MAX_ANNOTATION_POINTS)
      .map((pt: any) => ({
        x: typeof pt.x === "number" ? Math.max(0, Math.min(1, pt.x)) : 0,
        y: typeof pt.y === "number" ? Math.max(0, Math.min(1, pt.y)) : 0,
      }));
    if (points.length === 0) return;
    const ann: Annotation = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      pdfId: payload.pdfId,
      page: payload.page,
      tool,
      color,
      points,
      createdBy: p.sessionId,
      createdByName: p.displayName,
      createdAt: Date.now(),
    };
    room.annotations.push(ann);
    if (room.annotations.length > MAX_ANNOTATIONS) {
      room.annotations.splice(0, room.annotations.length - MAX_ANNOTATIONS);
    }
    io.to(room.roomCode).emit("annotation:added", ann);
  });

  socket.on("annotation:remove", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const p = findParticipantBySocket(room, socket.id);
    if (!p) return;
    const ann = room.annotations.find((a) => a.id === payload.annotationId);
    if (!ann) return;
    if (ann.createdBy !== p.sessionId && p.sessionId !== room.hostId) {
      socket.emit("system:message", { type: "warn", message: "Only the author or host can remove annotations." });
      return;
    }
    room.annotations = room.annotations.filter((a) => a.id !== payload.annotationId);
    io.to(room.roomCode).emit("annotation:removed", { annotationId: payload.annotationId });
  });

  socket.on("annotation:clear_page", (payload) => {
    const room = rooms.get(payload.roomCode);
    if (!room) return;
    const p = findParticipantBySocket(room, socket.id);
    if (!p) return;
    if (p.sessionId !== room.hostId) {
      socket.emit("system:message", { type: "warn", message: "Only the host can clear a page." });
      return;
    }
    room.annotations = room.annotations.filter((a) => !(a.pdfId === payload.pdfId && a.page === payload.page));
    io.to(room.roomCode).emit("annotation:page_cleared", { pdfId: payload.pdfId, page: payload.page });
  });

  // Re-broadcast uploaded pdf metadata to the room.
  socket.on("pdf:uploaded" as any, (payload: any) => {
    const room = rooms.get(payload?.roomCode);
    if (!room) return;
    const meta: RoomPdfMeta = {
      id: payload.id,
      originalName: payload.originalName,
      fileSize: payload.fileSize,
      uploadedByName: payload.uploadedByName ?? null,
      createdAt: payload.createdAt ?? new Date().toISOString(),
    };
    if (!room.pdfs.find((p) => p.id === meta.id)) {
      room.pdfs.push(meta);
    }
    io.to(payload.roomCode).emit("pdf:uploaded", meta);
  });

  socket.on("disconnect", () => {
    // find which rooms this socket was in
    for (const room of rooms.values()) {
      const sessionId = room.sessionIdBySocket.get(socket.id);
      if (!sessionId) continue;
      const participant = room.participants.get(socket.id);
      room.participants.delete(socket.id);
      room.sessionIdBySocket.delete(socket.id);
      // keep socketBySessionId mapping so reconnect by sessionId reclaims identity quickly
      room.socketBySessionId.delete(sessionId);
      socket.to(room.roomCode).emit("participant:left", socket.id);
      broadcastParticipantList(room);

      // If host left, promote the next participant.
      if (sessionId === room.hostId) {
        const next = Array.from(room.participants.values())[0];
        if (next) {
          room.hostId = next.sessionId;
          if (room.presenterEnabled && room.presenterId === sessionId) {
            room.presenterId = next.sessionId;
          }
          for (const part of room.participants.values()) {
            part.isHost = part.sessionId === room.hostId;
            part.isPresenter = room.presenterEnabled ? part.sessionId === room.presenterId : true;
          }
          broadcastParticipantList(room);
          broadcastPresenterState(room);
        } else {
          // No participants left. Keep state for a grace period so quick
          // refreshes recover it, then evict after 5 minutes.
          scheduleRoomEviction(room.roomCode);
        }
      }
      if (participant) {
        console.log(`[sync] ${participant.displayName} left ${room.roomCode}`);
      }
    }
  });

  socket.on("error", (err) => {
    console.error(`[sync] socket error ${socket.id}`, err);
  });
});

// --- Eviction & countdown finish watchdogs ---

const evictionTimers = new Map<string, NodeJS.Timeout>();

function scheduleRoomEviction(roomCode: string) {
  if (evictionTimers.has(roomCode)) return;
  const t = setTimeout(() => {
    const room = rooms.get(roomCode);
    if (room && room.participants.size === 0) {
      rooms.delete(roomCode);
      console.log(`[sync] evicted empty room ${roomCode}`);
    }
    evictionTimers.delete(roomCode);
  }, 5 * 60 * 1000);
  evictionTimers.set(roomCode, t);
}

function cancelRoomEviction(roomCode: string) {
  const t = evictionTimers.get(roomCode);
  if (t) {
    clearTimeout(t);
    evictionTimers.delete(roomCode);
  }
}

// Watch running countdowns and flip to finished.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const t = room.timer;
    if (t.mode === "countdown" && t.status === "running" && t.duration != null && t.startedAt != null) {
      const elapsed = t.elapsed + (now - t.startedAt);
      if (elapsed >= t.duration) {
        t.status = "finished";
        t.elapsed = t.duration;
        t.startedAt = null;
        t.pausedAt = now;
        broadcastTimer(room);
      }
    }
  }
}, 500);

const PORT = 3002;
httpServer.listen(PORT, () => {
  console.log(`[livepdf-sync] Socket.IO server running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[livepdf-sync] SIGTERM, shutting down");
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("[livepdf-sync] SIGINT, shutting down");
  httpServer.close(() => process.exit(0));
});
