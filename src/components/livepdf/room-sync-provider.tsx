"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getSocket, disposeSocket, LivePdfSocket } from "@/lib/socket";
import { ensureLocalParticipant } from "@/lib/participant";
import {
  type Participant,
  type RoomPdfMeta,
  type RoomState,
  type TimerState,
  type ViewerState,
  type TimerMode,
  type ChatMessage,
  type QuestionMarker,
  type MarkerColor,
  type SharedNote,
  type Annotation,
  type AnnotationTool,
  type AnnotationColor,
  emptyTimerState,
  emptyViewerState,
  computeElapsedMs,
} from "@/lib/types";
import { SCROLL_THROTTLE_MS } from "@/lib/constants";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

interface RoomSyncContextValue {
  roomCode: string;
  me: { sessionId: string; displayName: string } | null;
  connection: ConnectionStatus;
  participants: Participant[];
  pdfs: RoomPdfMeta[];
  viewer: ViewerState;
  timer: TimerState;
  presenterEnabled: boolean;
  presenterId: string | null;
  canControl: boolean; // can the local user drive the viewer
  isHost: boolean;

  // viewer actions (emit to server; loop prevention via changedBy on server echo)
  selectPdf: (pdfId: string | null) => void;
  emitPage: (page: number, totalPages: number) => void;
  emitScroll: (scrollX: number, scrollY: number, page: number) => void;
  emitZoom: (zoom: number) => void;
  emitRotation: (rotation: number) => void;

  // timer actions
  timerStart: (mode: TimerMode, durationMs?: number) => void;
  timerPause: () => void;
  timerResume: () => void;
  timerReset: () => void;

  // presenter actions
  setPresenter: (sessionId: string | null) => void;
  togglePresenterMode: (enabled: boolean) => void;

  // pdf management (API + broadcast)
  uploadPdf: (file: File) => Promise<boolean>;
  deletePdf: (pdfId: string) => Promise<boolean>;
  refetchPdfs: () => Promise<void>;

  // chat
  chat: ChatMessage[];
  sendChat: (text: string) => void;
  typingUsers: { sessionId: string; displayName: string }[];
  setTyping: (isTyping: boolean) => void;

  // markers
  markers: QuestionMarker[];
  addMarker: (pdfId: string, page: number, label: string, color: MarkerColor) => void;
  removeMarker: (markerId: string) => void;

  // shared notes
  note: SharedNote | null;
  editNote: (content: string) => void;

  // annotations
  annotations: Annotation[];
  addAnnotation: (pdfId: string, page: number, tool: AnnotationTool, color: AnnotationColor, points: { x: number; y: number }[]) => void;
  removeAnnotation: (annotationId: string) => void;
  clearPageAnnotations: (pdfId: string, page: number) => void;
  undoAnnotation: () => void;
  canUndoAnnotation: boolean;
  redoAnnotation: () => void;
  canRedoAnnotation: boolean;

  // connection quality + kick
  latencyMs: number;
  kickParticipant: (sessionId: string) => void;
  kicked: boolean;

  // clock for timer display
  clockOffsetMs: number;
}

const RoomSyncContext = createContext<RoomSyncContextValue | null>(null);

export function useRoomSync(): RoomSyncContextValue {
  const ctx = useContext(RoomSyncContext);
  if (!ctx) throw new Error("useRoomSync must be used inside <RoomSyncProvider>");
  return ctx;
}

export function RoomSyncProvider({
  roomCode,
  displayName,
  children,
}: {
  roomCode: string;
  displayName: string;
  children: React.ReactNode;
}) {
  const socketRef = useRef<LivePdfSocket | null>(null);
  const myLastAnnotationsRef = useRef<string[]>([]);
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [pdfs, setPdfs] = useState<RoomPdfMeta[]>([]);
  const [viewer, setViewer] = useState<ViewerState>(emptyViewerState());
  const [timer, setTimer] = useState<TimerState>(emptyTimerState());
  const [presenterEnabled, setPresenterEnabled] = useState(false);
  const [presenterId, setPresenterId] = useState<string | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [isHost, setIsHost] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [markers, setMarkers] = useState<QuestionMarker[]>([]);
  const [note, setNote] = useState<SharedNote | null>(null);
  const [typingUsers, setTypingUsers] = useState<{ sessionId: string; displayName: string }[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [undoStack, setUndoStack] = useState<string[]>([]); // annotation ids created by me, LIFO
  const [redoStack, setRedoStack] = useState<{ pdfId: string; page: number; tool: AnnotationTool; color: AnnotationColor; points: { x: number; y: number }[] }[]>([]);
  const redoDataRef = useRef<Map<string, { pdfId: string; page: number; tool: AnnotationTool; color: AnnotationColor; points: { x: number; y: number }[] }>>(new Map());
  const [latencyMs, setLatencyMs] = useState(0);
  const [kicked, setKicked] = useState(false);

  const participant = useMemo(
    () => ensureLocalParticipant(displayName),
    [displayName]
  );
  const mySessionId = participant.sessionId;

  // keep latest values in refs for emit callbacks
  const roomCodeRef = useRef(roomCode);
  roomCodeRef.current = roomCode;
  const mySessionIdRef = useRef(mySessionId);
  mySessionIdRef.current = mySessionId;

  const canControl = !presenterEnabled || presenterId === mySessionId;

  // --- fetch pdfs from API (source of truth) ---
  const refetchPdfs = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomCodeRef.current}/pdfs`);
      if (!res.ok) return;
      const data = await res.json();
      setPdfs(data.pdfs ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  // Always fetch PDFs on mount (independent of socket connect) so the list
  // populates even if the realtime socket is briefly unavailable.
  useEffect(() => {
    refetchPdfs();
  }, [refetchPdfs]);

  // --- connect + join ---
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const onConnect = () => {
      setConnection("connected");
      socket.emit("room:join", {
        roomCode: roomCodeRef.current,
        sessionId: mySessionIdRef.current,
        displayName,
      }, (ack) => {
        if (ack?.ok && ack.state) {
          setParticipants(ack.state.participants);
          setPdfs(ack.state.pdfs);
          setViewer(ack.state.viewer);
          setTimer(ack.state.timer);
          setPresenterEnabled(ack.state.presenterEnabled);
          setPresenterId(ack.state.presenterId);
          setClockOffsetMs(ack.state.serverTime - Date.now());
          setChat(ack.state.chat || []);
          setMarkers(ack.state.markers || []);
          setNote(ack.state.note || null);
          setAnnotations(ack.state.annotations || []);
          const meInRoom = ack.state.participants.find((p) => p.sessionId === mySessionIdRef.current);
          setIsHost(!!meInRoom?.isHost);
        }
      });
      // also fetch pdfs from DB to recover any missed uploads
      refetchPdfs();
    };
    const onDisconnect = () => setConnection("disconnected");
    const onReconnectAttempt = () => setConnection("reconnecting");
    const onReconnect = () => setConnection("connected");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("reconnect_attempt", onReconnectAttempt);
    socket.on("reconnect", onReconnect);

    // server-pushed events
    socket.on("room:state", (state) => {
      setParticipants(state.participants);
      setPdfs(state.pdfs);
      setViewer(state.viewer);
      setTimer(state.timer);
      setPresenterEnabled(state.presenterEnabled);
      setPresenterId(state.presenterId);
      setClockOffsetMs(state.serverTime - Date.now());
      setChat(state.chat || []);
      setMarkers(state.markers || []);
      setNote(state.note || null);
      setAnnotations(state.annotations || []);
      const meInRoom = state.participants.find((p) => p.sessionId === mySessionIdRef.current);
      setIsHost(!!meInRoom?.isHost);
    });
    socket.on("participant:joined", (p) => {
      setParticipants((prev) => (prev.find((x) => x.sessionId === p.sessionId) ? prev.map((x) => x.sessionId === p.sessionId ? p : x) : [...prev, p]));
    });
    socket.on("participant:left", () => {
      // server sends full list shortly after; nothing to do here
    });
    socket.on("participant:list", (list) => {
      setParticipants(list);
      const meInRoom = list.find((p) => p.sessionId === mySessionIdRef.current);
      setIsHost(!!meInRoom?.isHost);
    });
    socket.on("pdf:uploaded", (meta) => {
      setPdfs((prev) => (prev.find((p) => p.id === meta.id) ? prev : [...prev, meta]));
    });
    socket.on("pdf:deleted", ({ pdfId }) => {
      setPdfs((prev) => prev.filter((p) => p.id !== pdfId));
    });
    socket.on("pdf:selected", ({ pdfId, changedBy }) => {
      if (changedBy === mySessionIdRef.current) {
        // own echo — keep optimistic local state; still update pdfId
        setViewer((v) => ({ ...v, pdfId, kind: "select" }));
        return;
      }
      setViewer((v) => ({
        ...v,
        pdfId,
        currentPage: 1,
        scrollX: 0,
        scrollY: 0,
        zoom: v.zoom,
        rotation: v.rotation,
        kind: "select",
        changedBy,
        changedAt: Date.now(),
      }));
    });
    socket.on("viewer:page", (payload) => {
      if (payload.changedBy === mySessionIdRef.current) return;
      setViewer((v) => ({
        ...v,
        currentPage: payload.page,
        totalPages: payload.totalPages || v.totalPages,
        kind: "page",
        changedBy: payload.changedBy,
        changedAt: payload.changedAt,
      }));
    });
    socket.on("viewer:scroll", (payload) => {
      if (payload.changedBy === mySessionIdRef.current) return;
      setViewer((v) => ({
        ...v,
        scrollX: payload.scrollX,
        scrollY: payload.scrollY,
        currentPage: payload.page || v.currentPage,
        kind: "scroll",
        changedBy: payload.changedBy,
        changedAt: payload.changedAt,
      }));
    });
    socket.on("viewer:zoom", (payload) => {
      if (payload.changedBy === mySessionIdRef.current) return;
      setViewer((v) => ({ ...v, zoom: payload.zoom, kind: "zoom", changedBy: payload.changedBy, changedAt: payload.changedAt }));
    });
    socket.on("viewer:rotation", (payload) => {
      if (payload.changedBy === mySessionIdRef.current) return;
      setViewer((v) => ({ ...v, rotation: payload.rotation, kind: "rotation", changedBy: payload.changedBy, changedAt: payload.changedAt }));
    });
    socket.on("timer:state", (state) => setTimer(state));
    socket.on("presenter:state", ({ enabled, presenterId }) => {
      setPresenterEnabled(enabled);
      setPresenterId(presenterId);
    });
    socket.on("chat:message", (msg) => {
      setChat((prev) => [...prev, msg]);
    });
    socket.on("chat:history", (messages) => {
      setChat(messages);
    });
    socket.on("chat:typing", ({ sessionId, displayName, isTyping }) => {
      setTypingUsers((prev) => {
        if (!isTyping) return prev.filter((u) => u.sessionId !== sessionId);
        return prev.find((u) => u.sessionId === sessionId) ? prev : [...prev, { sessionId, displayName }];
      });
    });
    socket.on("marker:added", (marker) => {
      setMarkers((prev) => (prev.find((m) => m.id === marker.id) ? prev : [...prev, marker]));
    });
    socket.on("marker:removed", ({ markerId }) => {
      setMarkers((prev) => prev.filter((m) => m.id !== markerId));
    });
    socket.on("marker:list", (list) => {
      setMarkers(list);
    });
    socket.on("note:updated", (edit) => {
      setNote({
        content: edit.content,
        updatedAt: edit.updatedAt,
        updatedBy: edit.updatedBy,
        updatedByName: edit.updatedByName,
      });
    });
    socket.on("annotation:added", (ann) => {
      setAnnotations((prev) => (prev.find((a) => a.id === ann.id) ? prev : [...prev, ann]));
      // track my own annotations for undo + store data for redo
      if (ann.createdBy === mySessionIdRef.current) {
        myLastAnnotationsRef.current.push(ann.id);
        redoDataRef.current.set(ann.id, {
          pdfId: ann.pdfId,
          page: ann.page,
          tool: ann.tool,
          color: ann.color,
          points: ann.points,
        });
        setUndoStack((prev) => [...prev, ann.id]);
        // creating a new annotation clears the redo stack
        setRedoStack([]);
      }
    });
    socket.on("annotation:removed", ({ annotationId }) => {
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    });
    socket.on("annotation:page_cleared", ({ pdfId, page }) => {
      setAnnotations((prev) => prev.filter((a) => !(a.pdfId === pdfId && a.page === page)));
    });
    socket.on("annotation:list", (list) => {
      setAnnotations(list);
    });
    socket.on("system:kicked", () => {
      setKicked(true);
    });

    // ensure connected (in case socket was already open from a previous mount)
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("reconnect_attempt", onReconnectAttempt);
      socket.off("reconnect", onReconnect);
      socket.off("room:state");
      socket.off("participant:joined");
      socket.off("participant:left");
      socket.off("participant:list");
      socket.off("pdf:uploaded");
      socket.off("pdf:deleted");
      socket.off("pdf:selected");
      socket.off("viewer:page");
      socket.off("viewer:scroll");
      socket.off("viewer:zoom");
      socket.off("viewer:rotation");
      socket.off("timer:state");
      socket.off("presenter:state");
      socket.off("chat:message");
      socket.off("chat:history");
      socket.off("chat:typing");
      socket.off("marker:added");
      socket.off("marker:removed");
      socket.off("marker:list");
      socket.off("note:updated");
      socket.off("annotation:added");
      socket.off("annotation:removed");
      socket.off("annotation:page_cleared");
      socket.off("annotation:list");
      socket.off("system:kicked");
      // leave the room socket
      try {
        socket.emit("room:leave", { roomCode: roomCodeRef.current });
      } catch {}
      // Do NOT dispose the singleton socket — other components may reuse; we just detach listeners.
    };
  }, [roomCode, displayName]);

  // periodic clock-offset re-sync (drift correction for long sessions)
  // Every 60s, request fresh room state from the server which carries an
  // up-to-date serverTime, and recompute the offset.
  useEffect(() => {
    const t = setInterval(() => {
      const socket = socketRef.current;
      if (!socket) return;
      socket.emit("room:request_state", { roomCode: roomCodeRef.current }, (ack) => {
        if (ack?.ok && ack.state) {
          setClockOffsetMs(ack.state.serverTime - Date.now());
        }
      });
    }, 60000);
    return () => clearInterval(t);
  }, []);

  // latency measurement: ping every 10s, round-trip / 2 = latency
  useEffect(() => {
    let active = true;
    const measure = () => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) return;
      const t = Date.now();
      socket.emit("ping", { t }, (res) => {
        if (!active) return;
        const rtt = Date.now() - t;
        setLatencyMs(Math.max(0, Math.round(rtt / 2)));
        if (res?.serverTime) {
          setClockOffsetMs(res.serverTime - Date.now());
        }
      });
    };
    const interval = setInterval(measure, 10000);
    measure(); // initial
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [connection]);

  // kick action (host only)
  const kickParticipant = useCallback((sessionId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("participant:kick", { roomCode: roomCodeRef.current, sessionId });
  }, []);

  // --- viewer actions ---
  const selectPdf = useCallback((pdfId: string | null) => {
    const socket = socketRef.current;
    if (!socket) return;
    setViewer((v) => ({ ...v, pdfId, currentPage: 1, scrollX: 0, scrollY: 0, kind: "select", changedBy: mySessionIdRef.current, changedAt: Date.now() }));
    socket.emit("pdf:selected", { roomCode: roomCodeRef.current, pdfId });
  }, []);

  const emitPage = useCallback((page: number, totalPages: number) => {
    const socket = socketRef.current;
    if (!socket) return;
    setViewer((v) => ({ ...v, currentPage: page, totalPages, kind: "page", changedBy: mySessionIdRef.current, changedAt: Date.now() }));
    socket.emit("viewer:page", { roomCode: roomCodeRef.current, page, totalPages });
  }, []);

  // throttled scroll emit (cadence is controlled by the viewer; provider just forwards)
  const lastScrollEmitRef = useRef(0);
  const emitScroll = useCallback((scrollX: number, scrollY: number, page: number) => {
    const socket = socketRef.current;
    if (!socket) return;
    const now = Date.now();
    // allow at most ~30 emits/sec from the provider side as a safety cap
    if (now - lastScrollEmitRef.current < 33) return;
    lastScrollEmitRef.current = now;
    setViewer((v) => ({ ...v, scrollX, scrollY, currentPage: page, kind: "scroll", changedBy: mySessionIdRef.current, changedAt: now }));
    socket.emit("viewer:scroll", { roomCode: roomCodeRef.current, scrollX, scrollY, page });
  }, []);

  const emitZoom = useCallback((zoom: number) => {
    // Always update local state immediately — even if the socket isn't connected,
    // the PDF viewer should still respond to zoom.
    setViewer((v) => ({ ...v, zoom, kind: "zoom", changedBy: mySessionIdRef.current, changedAt: Date.now() }));
    // Broadcast to others (no-op if socket isn't ready)
    const socket = socketRef.current;
    if (socket) {
      socket.emit("viewer:zoom", { roomCode: roomCodeRef.current, zoom });
    }
  }, []);

  const emitRotation = useCallback((rotation: number) => {
    const socket = socketRef.current;
    if (!socket) return;
    setViewer((v) => ({ ...v, rotation, kind: "rotation", changedBy: mySessionIdRef.current, changedAt: Date.now() }));
    socket.emit("viewer:rotation", { roomCode: roomCodeRef.current, rotation });
  }, []);

  // --- timer actions ---
  const timerStart = useCallback((mode: TimerMode, durationMs?: number) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("timer:start", { roomCode: roomCodeRef.current, mode, duration: durationMs });
  }, []);
  const timerPause = useCallback(() => {
    socketRef.current?.emit("timer:pause", { roomCode: roomCodeRef.current });
  }, []);
  const timerResume = useCallback(() => {
    socketRef.current?.emit("timer:resume", { roomCode: roomCodeRef.current });
  }, []);
  const timerReset = useCallback(() => {
    socketRef.current?.emit("timer:reset", { roomCode: roomCodeRef.current });
  }, []);

  // --- presenter actions ---
  const setPresenter = useCallback((sessionId: string | null) => {
    socketRef.current?.emit("presenter:set", { roomCode: roomCodeRef.current, presenterId: sessionId });
  }, []);
  const togglePresenterMode = useCallback((enabled: boolean) => {
    socketRef.current?.emit("presenter:toggle_mode", { roomCode: roomCodeRef.current, enabled });
  }, []);

  // --- pdf management ---
  const uploadPdf = useCallback(async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("uploadedByName", participant.displayName);
    fd.append("uploadedById", participant.sessionId);
    try {
      const res = await fetch(`/api/rooms/${roomCodeRef.current}/pdfs`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const meta: RoomPdfMeta = data.pdf;
      setPdfs((prev) => (prev.find((p) => p.id === meta.id) ? prev : [...prev, meta]));
      // broadcast to room via socket (server mirrors + notifies others)
      socketRef.current?.emit("pdf:uploaded" as any, {
        roomCode: roomCodeRef.current,
        ...meta,
        createdAt: typeof meta.createdAt === "string" ? meta.createdAt : new Date(meta.createdAt).toISOString(),
      } as any);
      return true;
    } catch {
      return false;
    }
  }, [participant]);

  const deletePdf = useCallback(async (pdfId: string) => {
    try {
      const res = await fetch(`/api/pdfs/${pdfId}`, { method: "DELETE" });
      if (!res.ok) return false;
      setPdfs((prev) => prev.filter((p) => p.id !== pdfId));
      socketRef.current?.emit("pdf:deleted", { roomCode: roomCodeRef.current, pdfId });
      // if current pdf deleted, clear selection
      setViewer((v) => (v.pdfId === pdfId ? { ...v, pdfId: null, currentPage: 1, totalPages: 0 } : v));
      return true;
    } catch {
      return false;
    }
  }, []);

  // --- chat actions ---
  const sendChat = useCallback((text: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    const trimmed = text.trim().slice(0, 1000);
    if (!trimmed) return;
    socket.emit("chat:message", { roomCode: roomCodeRef.current, text: trimmed });
    socket.emit("chat:typing", { roomCode: roomCodeRef.current, isTyping: false });
    // persist to DB (fire-and-forget)
    fetch(`/api/rooms/${roomCodeRef.current}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, authorId: participant.sessionId, authorName: participant.displayName }),
    }).catch(() => {});
  }, [participant]);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setTyping = useCallback((isTyping: boolean) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("chat:typing", { roomCode: roomCodeRef.current, isTyping });
    if (isTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("chat:typing", { roomCode: roomCodeRef.current, isTyping: false });
      }, 4000);
    }
  }, []);

  // --- marker actions ---
  const addMarker = useCallback((pdfId: string, page: number, label: string, color: MarkerColor) => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!pdfId || page < 1) return;
    socket.emit("marker:add", {
      roomCode: roomCodeRef.current,
      pdfId,
      page,
      label: label.trim().slice(0, 120),
      color,
    });
    // persist to DB (fire-and-forget)
    fetch(`/api/rooms/${roomCodeRef.current}/markers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfId, page,
        label: label.trim().slice(0, 120),
        color,
        createdBy: participant.sessionId,
        createdByName: participant.displayName,
      }),
    }).catch(() => {});
  }, [participant]);

  const removeMarker = useCallback((markerId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("marker:remove", { roomCode: roomCodeRef.current, markerId });
    fetch(`/api/rooms/${roomCodeRef.current}/markers?id=${encodeURIComponent(markerId)}`, { method: "DELETE" }).catch(() => {});
  }, []);

  // --- shared notes actions ---
  const editNote = useCallback((content: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    const trimmed = content.slice(0, 20000);
    socket.emit("note:edit", { roomCode: roomCodeRef.current, content: trimmed });
    // persist (debounced by caller)
    fetch(`/api/rooms/${roomCodeRef.current}/notes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: trimmed,
        updatedBy: participant.sessionId,
        updatedByName: participant.displayName,
      }),
    }).catch(() => {});
  }, [participant]);

  // --- annotation actions ---
  const addAnnotation = useCallback((
    pdfId: string,
    page: number,
    tool: AnnotationTool,
    color: AnnotationColor,
    points: { x: number; y: number }[]
  ) => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!pdfId || page < 1 || points.length === 0) return;
    const safePoints = points.slice(0, 2000);
    socket.emit("annotation:add", {
      roomCode: roomCodeRef.current,
      pdfId,
      page,
      tool,
      color,
      points: safePoints,
    });
    // persist to DB (fire-and-forget)
    fetch(`/api/rooms/${roomCodeRef.current}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfId, page, tool, color, points: safePoints,
        createdBy: participant.sessionId,
        createdByName: participant.displayName,
      }),
    }).catch(() => {});
  }, [participant]);

  const removeAnnotation = useCallback((annotationId: string) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("annotation:remove", { roomCode: roomCodeRef.current, annotationId });
    fetch(`/api/rooms/${roomCodeRef.current}/annotations?id=${encodeURIComponent(annotationId)}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const clearPageAnnotations = useCallback((pdfId: string, page: number) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("annotation:clear_page", { roomCode: roomCodeRef.current, pdfId, page });
    fetch(`/api/rooms/${roomCodeRef.current}/annotations?pdfId=${encodeURIComponent(pdfId)}&page=${page}`, { method: "DELETE" }).catch(() => {});
  }, []);

  // --- annotation undo / redo ---
  // Tracks annotation IDs created by the local user (via the annotation:added echo
  // matching their sessionId). Undo pops the last one and removes it; Redo re-creates it.
  // myLastAnnotationsRef is declared near the top of the provider.

  const undoAnnotation = useCallback(() => {
    const lastId = myLastAnnotationsRef.current[myLastAnnotationsRef.current.length - 1];
    if (!lastId) return;
    const data = redoDataRef.current.get(lastId);
    myLastAnnotationsRef.current.pop();
    const socket = socketRef.current;
    if (socket) {
      socket.emit("annotation:remove", { roomCode: roomCodeRef.current, annotationId: lastId });
    }
    fetch(`/api/rooms/${roomCodeRef.current}/annotations?id=${encodeURIComponent(lastId)}`, { method: "DELETE" }).catch(() => {});
    setUndoStack((prev) => prev.slice(0, -1));
    // push to redo stack (so redo can re-create it)
    if (data) {
      setRedoStack((prev) => [...prev, data]);
    }
  }, []);

  const redoAnnotation = useCallback(() => {
    const lastRedo = redoStack[redoStack.length - 1];
    if (!lastRedo) return;
    // re-create the annotation (server will assign a new id + echo back)
    const socket = socketRef.current;
    if (socket) {
      socket.emit("annotation:add", {
        roomCode: roomCodeRef.current,
        pdfId: lastRedo.pdfId,
        page: lastRedo.page,
        tool: lastRedo.tool,
        color: lastRedo.color,
        points: lastRedo.points,
      });
    }
    fetch(`/api/rooms/${roomCodeRef.current}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfId: lastRedo.pdfId,
        page: lastRedo.page,
        tool: lastRedo.tool,
        color: lastRedo.color,
        points: lastRedo.points,
        createdBy: participant.sessionId,
        createdByName: participant.displayName,
      }),
    }).catch(() => {});
    // pop from redo stack (the annotation:added echo will push a new id to undo stack)
    setRedoStack((prev) => prev.slice(0, -1));
  }, [redoStack, participant]);

  const canUndoAnnotation = undoStack.length > 0;
  const canRedoAnnotation = redoStack.length > 0;

  // On mount: fetch persisted chat / markers / note / annotations from DB and seed
  // the in-memory room state if the sync server doesn't already have it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [chatRes, markersRes, noteRes, annRes] = await Promise.all([
          fetch(`/api/rooms/${roomCode}/chat`).then((r) => r.json()),
          fetch(`/api/rooms/${roomCode}/markers`).then((r) => r.json()),
          fetch(`/api/rooms/${roomCode}/notes`).then((r) => r.json()),
          fetch(`/api/rooms/${roomCode}/annotations`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (chatRes.messages?.length) {
          setChat((prev) => (prev.length === 0 ? chatRes.messages : prev));
        }
        if (markersRes.markers?.length) {
          setMarkers((prev) => (prev.length === 0 ? markersRes.markers : prev));
        }
        if (annRes.annotations?.length) {
          setAnnotations((prev) => (prev.length === 0 ? annRes.annotations : prev));
        }
        if (noteRes.note) {
          setNote((prev) => prev ?? noteRes.note);
          // seed the sync server's in-memory note so other clients get it
          socketRef.current?.emit("note:set_state" as any, {
            roomCode,
            content: noteRes.note.content,
            updatedAt: noteRes.note.updatedAt,
            updatedBy: noteRes.note.updatedBy,
            updatedByName: noteRes.note.updatedByName,
          } as any);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [roomCode]);

  const value: RoomSyncContextValue = {
    roomCode,
    me: participant,
    connection,
    participants,
    pdfs,
    viewer,
    timer,
    presenterEnabled,
    presenterId,
    canControl,
    isHost,
    selectPdf,
    emitPage,
    emitScroll,
    emitZoom,
    emitRotation,
    timerStart,
    timerPause,
    timerResume,
    timerReset,
    setPresenter,
    togglePresenterMode,
    uploadPdf,
    deletePdf,
    refetchPdfs,
    chat,
    sendChat,
    typingUsers,
    setTyping,
    markers,
    addMarker,
    removeMarker,
    note,
    editNote,
    annotations,
    addAnnotation,
    removeAnnotation,
    clearPageAnnotations,
    undoAnnotation,
    canUndoAnnotation,
    redoAnnotation,
    canRedoAnnotation,
    latencyMs,
    kickParticipant,
    kicked,
    clockOffsetMs,
  };

  return <RoomSyncContext.Provider value={value}>{children}</RoomSyncContext.Provider>;
}

/** Helper: compute live elapsed ms from the current timer state using clock offset. */
export function useElapsedMs(): number {
  const { timer, clockOffsetMs } = useRoomSync();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (timer.status !== "running") return;
    const i = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(i);
  }, [timer.status]);
  void tick;
  return computeElapsedMs(timer, clockOffsetMs);
}
