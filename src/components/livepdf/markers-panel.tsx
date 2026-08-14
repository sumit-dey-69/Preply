"use client";

import { useState } from "react";
import { useRoomSync } from "./room-sync-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Bookmark,
  Flag,
  Trash2,
  Plus,
  BookmarkCheck,
  Inbox,
} from "lucide-react";
import type { MarkerColor } from "@/lib/types";

const COLORS: { value: MarkerColor; label: string; ring: string; dot: string; chip: string }[] = [
  { value: "amber", label: "Amber", ring: "ring-amber-500", dot: "bg-amber-500", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  { value: "emerald", label: "Emerald", ring: "ring-emerald-500", dot: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  { value: "rose", label: "Rose", ring: "ring-rose-500", dot: "bg-rose-500", chip: "bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  { value: "violet", label: "Violet", ring: "ring-violet-500", dot: "bg-violet-500", chip: "bg-violet-500/10 text-violet-700 dark:text-violet-400" },
];

function colorMeta(c: MarkerColor) {
  return COLORS.find((x) => x.value === c) ?? COLORS[0];
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MarkersPanel() {
  const sync = useRoomSync();
  const { markers, viewer, me, addMarker, removeMarker, selectPdf } = sync;
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<MarkerColor>("amber");

  const currentPdfMarkers = markers.filter((m) => m.pdfId === viewer.pdfId);
  const otherMarkers = markers.filter((m) => m.pdfId !== viewer.pdfId);

  function handleAdd() {
    if (!viewer.pdfId) return;
    addMarker(viewer.pdfId, viewer.currentPage || 1, label, color);
    setLabel("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Question Markers</h3>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {markers.length}
          </span>
        </div>
      </div>

      {/* add marker form */}
      {viewer.pdfId && (
        <div className="border-b p-2.5">
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            Pin to <span className="font-medium text-foreground">page {viewer.currentPage || 1}</span> of current PDF
          </p>
          <div className="flex items-center gap-1.5">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              placeholder="e.g. Q5 — tricky integral"
              maxLength={120}
              className="h-8 text-sm"
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleAdd}
              disabled={!viewer.pdfId}
              title="Add marker"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                className={cn(
                  "h-5 w-5 rounded-full transition-all",
                  c.dot,
                  color === c.value ? cn("ring-2 ring-offset-2 ring-offset-background", c.ring) : "opacity-60 hover:opacity-100"
                )}
                title={c.label}
                aria-label={c.label}
              />
            ))}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-2">
          {markers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-3 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Inbox className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">No markers yet</p>
              <p className="text-xs text-muted-foreground">
                Flag a question on the current page so everyone can jump back to it.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {currentPdfMarkers.length > 0 && (
                <div className="space-y-1.5">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Current PDF
                  </p>
                  {currentPdfMarkers.map((m) => {
                    const cm = colorMeta(m.color);
                    const isMine = m.createdBy === me?.sessionId;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "group relative flex items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors hover:bg-accent/50",
                          viewer.currentPage === m.page && "border-emerald-500/40 bg-emerald-500/5"
                        )}
                      >
                        <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", cm.dot)} />
                        <button
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            if (viewer.pdfId === m.pdfId) {
                              // jump to page — emit a page change
                              sync.emitPage(m.page, viewer.totalPages);
                            } else {
                              selectPdf(m.pdfId);
                              setTimeout(() => sync.emitPage(m.page, viewer.totalPages), 300);
                            }
                          }}
                        >
                          <p className="truncate text-sm font-medium">{m.label}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className={cn("rounded px-1 py-0.5 font-medium", cm.chip)}>P{m.page}</span>
                            <span>· {m.createdByName}{isMine ? " (you)" : ""}</span>
                          </p>
                        </button>
                        <button
                          onClick={() => removeMarker(m.id)}
                          className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          title="Remove marker"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {otherMarkers.length > 0 && (
                <div className="space-y-1.5">
                  <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Other PDFs
                  </p>
                  {otherMarkers.map((m) => {
                    const cm = colorMeta(m.color);
                    return (
                      <div
                        key={m.id}
                        className="group relative flex items-start gap-2 rounded-lg border px-2.5 py-2 opacity-80 transition-colors hover:bg-accent/50"
                      >
                        <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", cm.dot)} />
                        <button
                          className="min-w-0 flex-1 text-left"
                          onClick={() => selectPdf(m.pdfId)}
                        >
                          <p className="truncate text-sm font-medium">{m.label}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className={cn("rounded px-1 py-0.5 font-medium", cm.chip)}>P{m.page}</span>
                            <span>· {m.createdByName}</span>
                          </p>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
