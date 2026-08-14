"use client";

import { useState } from "react";
import { useRoomSync } from "./room-sync-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnnotationTool, AnnotationColor } from "@/lib/types";
import { TOOLS, COLORS, COLOR_HEX } from "./annotation-layer";
import {
  Highlighter,
  Pen,
  Square,
  Eraser,
  MousePointer2,
  Trash2,
  Undo2,
  Redo2,
  X,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Highlighter,
  Pen,
  Square,
  Eraser,
};

export function AnnotationToolbar({
  activeTool,
  onToolChange,
  color,
  onColorChange,
  onClose,
}: {
  activeTool: AnnotationTool | null;
  onToolChange: (t: AnnotationTool | null) => void;
  color: AnnotationColor;
  onColorChange: (c: AnnotationColor) => void;
  onClose: () => void;
}) {
  const sync = useRoomSync();
  const { viewer, isHost, undoAnnotation, canUndoAnnotation, redoAnnotation, canRedoAnnotation } = sync;

  function handleClearPage() {
    if (!viewer.pdfId) return;
    if (!confirm("Clear all annotations on this page? (host only)")) return;
    sync.clearPageAnnotations(viewer.pdfId, viewer.currentPage || 1);
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border bg-card/95 px-1.5 py-1 shadow-sm backdrop-blur">
      {/* select/cursor tool */}
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-7 w-7", activeTool === null && "bg-accent text-accent-foreground")}
        onClick={() => onToolChange(null)}
        title="Select (no drawing)"
      >
        <MousePointer2 className="h-3.5 w-3.5" />
      </Button>

      <div className="mx-0.5 h-5 w-px bg-border" />

      {/* drawing tools */}
      {TOOLS.map((t) => {
        const Icon = ICONS[t.icon] ?? Pen;
        return (
          <Button
            key={t.value}
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", activeTool === t.value && "bg-accent text-accent-foreground")}
            onClick={() => onToolChange(t.value)}
            title={t.label}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        );
      })}

      <div className="mx-0.5 h-5 w-px bg-border" />

      {/* color picker */}
      <div className="flex items-center gap-0.5">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onColorChange(c)}
            className={cn(
              "h-4 w-4 rounded-full transition-all",
              color === c ? "ring-2 ring-offset-1 ring-offset-card ring-foreground/40 scale-110" : "opacity-60 hover:opacity-100"
            )}
            style={{ backgroundColor: COLOR_HEX[c] }}
            title={c}
            aria-label={c}
          />
        ))}
      </div>

      <div className="mx-0.5 h-5 w-px bg-border" />

      {/* undo */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={undoAnnotation}
        disabled={!canUndoAnnotation}
        title="Undo last annotation (Ctrl+Z)"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>

      {/* redo */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={redoAnnotation}
        disabled={!canRedoAnnotation}
        title="Redo (Ctrl+Y)"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </Button>

      {/* clear page (host) */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={handleClearPage}
        disabled={!isHost}
        title={isHost ? "Clear annotations on this page" : "Host only"}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <div className="mx-0.5 h-5 w-px bg-border" />

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground"
        onClick={onClose}
        title="Exit annotation mode"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
