"use client";

import { useEffect, useRef, useState } from "react";
import { useRoomSync } from "./room-sync-provider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Activity, UserPlus, UserMinus, FileText, Bookmark, MessageSquare, StickyNote, Pencil } from "lucide-react";

interface ActivityEvent {
  id: string;
  type: "join" | "leave" | "upload" | "marker" | "chat" | "note" | "annotation";
  who: string;
  detail?: string;
  at: number;
}

const ICONS = {
  join: UserPlus,
  leave: UserMinus,
  upload: FileText,
  marker: Bookmark,
  chat: MessageSquare,
  note: StickyNote,
  annotation: Pencil,
};

const COLORS = {
  join: "text-emerald-600 bg-emerald-500/10",
  leave: "text-muted-foreground bg-muted",
  upload: "text-sky-600 bg-sky-500/10",
  marker: "text-amber-600 bg-amber-500/10",
  chat: "text-violet-600 bg-violet-500/10",
  note: "text-rose-600 bg-rose-500/10",
  annotation: "text-emerald-600 bg-emerald-500/10",
};

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return formatTime(ts);
}

export function ActivityFeed() {
  const sync = useRoomSync();
  const { participants, chat, markers, pdfs, note, annotations, me } = sync;
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const prevCountsRef = useRef({ participants: 0, chat: 0, markers: 0, pdfs: 0, annotations: 0, noteUpdatedAt: 0 });

  // Track new chat messages
  useEffect(() => {
    if (chat.length > prevCountsRef.current.chat) {
      const newMsg = chat[chat.length - 1];
      if (newMsg && !seenIdsRef.current.has(`chat-${newMsg.id}`)) {
        seenIdsRef.current.add(`chat-${newMsg.id}`);
        setEvents((prev) => [
          ...prev,
          { id: `chat-${newMsg.id}-${Date.now()}`, type: "chat", who: newMsg.authorName, detail: newMsg.text.slice(0, 60), at: newMsg.createdAt },
        ].slice(-50));
      }
    }
    prevCountsRef.current.chat = chat.length;
  }, [chat]);

  // Track new markers
  useEffect(() => {
    if (markers.length > prevCountsRef.current.markers) {
      const newMarker = markers[markers.length - 1];
      if (newMarker && !seenIdsRef.current.has(`marker-${newMarker.id}`)) {
        seenIdsRef.current.add(`marker-${newMarker.id}`);
        setEvents((prev) => [
          ...prev,
          { id: `marker-${newMarker.id}-${Date.now()}`, type: "marker", who: newMarker.createdByName, detail: newMarker.label, at: newMarker.createdAt },
        ].slice(-50));
      }
    }
    prevCountsRef.current.markers = markers.length;
  }, [markers]);

  // Track new PDF uploads
  useEffect(() => {
    if (pdfs.length > prevCountsRef.current.pdfs) {
      const newPdf = pdfs[pdfs.length - 1];
      if (newPdf && !seenIdsRef.current.has(`pdf-${newPdf.id}`)) {
        seenIdsRef.current.add(`pdf-${newPdf.id}`);
        setEvents((prev) => [
          ...prev,
          { id: `pdf-${newPdf.id}-${Date.now()}`, type: "upload", who: newPdf.uploadedByName || "Someone", detail: newPdf.originalName, at: Date.now() },
        ].slice(-50));
      }
    }
    prevCountsRef.current.pdfs = pdfs.length;
  }, [pdfs]);

  // Track new annotations (batched — only when count increases)
  useEffect(() => {
    if (annotations.length > prevCountsRef.current.annotations) {
      const newAnn = annotations[annotations.length - 1];
      if (newAnn && !seenIdsRef.current.has(`ann-${newAnn.id}`)) {
        seenIdsRef.current.add(`ann-${newAnn.id}`);
        setEvents((prev) => [
          ...prev,
          { id: `ann-${newAnn.id}-${Date.now()}`, type: "annotation", who: newAnn.createdByName, detail: `annotated page ${newAnn.page}`, at: newAnn.createdAt },
        ].slice(-50));
      }
    }
    prevCountsRef.current.annotations = annotations.length;
  }, [annotations]);

  // Track note edits
  useEffect(() => {
    if (note && note.updatedAt !== prevCountsRef.current.noteUpdatedAt && note.updatedByName) {
      if (!seenIdsRef.current.has(`note-${note.updatedAt}`)) {
        seenIdsRef.current.add(`note-${note.updatedAt}`);
        setEvents((prev) => [
          ...prev,
          { id: `note-${note.updatedAt}-${Date.now()}`, type: "note", who: note.updatedByName, detail: "edited shared notes", at: note.updatedAt },
        ].slice(-50));
      }
    }
    prevCountsRef.current.noteUpdatedAt = note?.updatedAt || 0;
  }, [note]);

  // Track participant joins (simplified — count increases)
  useEffect(() => {
    if (participants.length > prevCountsRef.current.participants) {
      const newP = participants[participants.length - 1];
      if (newP && !seenIdsRef.current.has(`join-${newP.sessionId}-${newP.joinedAt}`)) {
        seenIdsRef.current.add(`join-${newP.sessionId}-${newP.joinedAt}`);
        setEvents((prev) => [
          ...prev,
          { id: `join-${newP.sessionId}-${newP.joinedAt}`, type: "join", who: newP.displayName, at: newP.joinedAt },
        ].slice(-50));
      }
    }
    prevCountsRef.current.participants = participants.length;
  }, [participants]);

  const sorted = [...events].sort((a, b) => b.at - a.at).slice(0, 30);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Activity</h3>
        </div>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {events.length}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-3 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Activity className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">No activity yet</p>
              <p className="text-xs text-muted-foreground">
                Joins, uploads, chat, markers, and annotations will appear here.
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {sorted.map((ev) => {
                const Icon = ICONS[ev.type];
                const color = COLORS[ev.type];
                const isMe = ev.who === me?.displayName;
                return (
                  <li key={ev.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent/40">
                    <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", color)}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-tight">
                        <span className="font-medium">{isMe ? "You" : ev.who}</span>{" "}
                        <span className="text-muted-foreground">
                          {ev.type === "join" && "joined the room"}
                          {ev.type === "leave" && "left the room"}
                          {ev.type === "upload" && "uploaded"}
                          {ev.type === "marker" && "marked"}
                          {ev.type === "chat" && "messaged"}
                          {ev.type === "note" && ""}
                          {ev.type === "annotation" && ""}
                        </span>
                        {ev.detail && (
                          <span className="ml-1 truncate font-medium">"{ev.detail}"</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground" title={formatTime(ev.at)}>
                        {relativeTime(ev.at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
