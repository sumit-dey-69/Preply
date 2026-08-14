"use client";

import { useEffect, useRef, useState } from "react";
import { useRoomSync } from "./room-sync-provider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { StickyNote, Users, Loader2, Check } from "lucide-react";

const DEBOUNCE_MS = 400;

export function NotesPanel() {
  const sync = useRoomSync();
  const { note, editNote, me, participants } = sync;

  const [text, setText] = useState(note?.content ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteUpdateRef = useRef(false);
  const lastRemoteContentRef = useRef<string | null>(null);

  // sync external note changes into the textarea (unless the user is actively typing)
  useEffect(() => {
    if (remoteUpdateRef.current) {
      remoteUpdateRef.current = false;
      return;
    }
    const incoming = note?.content ?? "";
    if (incoming !== lastRemoteContentRef.current && incoming !== text) {
      lastRemoteContentRef.current = incoming;
      setText(incoming);
      setDirty(false);
    }
  }, [note?.updatedAt, note?.content]);

  function handleChange(value: string) {
    setText(value);
    setDirty(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaving(true);
    debounceRef.current = setTimeout(() => {
      lastRemoteContentRef.current = value;
      editNote(value);
      setSaving(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
      setDirty(false);
    }, DEBOUNCE_MS);
  }

  // cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const updatedByName = note?.updatedByName;
  const isMine = note?.updatedBy === me?.sessionId;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Shared Notes</h3>
        </div>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> saving…
            </>
          ) : savedFlash ? (
            <>
              <Check className="h-3 w-3 text-emerald-600" /> saved
            </>
          ) : dirty ? (
            "editing…"
          ) : updatedByName ? (
            <>
              <Users className="h-3 w-3" /> {isMine ? "you" : updatedByName}
            </>
          ) : null}
        </span>
      </div>

      <div className="flex-1 p-2.5">
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Shared scratchpad — jot formulas, key points, or a solution outline. Everyone in the room sees your edits live."
          className="livepdf-scroll h-full w-full resize-none rounded-lg border bg-background p-3 text-sm leading-relaxed shadow-inner outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          maxLength={20000}
        />
      </div>

      <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        {text.length.toLocaleString()} / 20,000 chars · auto-saves while you type
      </div>
    </div>
  );
}
