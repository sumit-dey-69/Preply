"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard, Search, Undo2, Redo2, ArrowLeft, ArrowRight } from "lucide-react";

const SHORTCUTS = [
  { keys: ["Ctrl", "Scroll"], desc: "Zoom in / out (desktop)", icon: Search },
  { keys: ["H"], desc: "Toggle left panel (PDF list)", icon: Keyboard },
  { keys: ["J"], desc: "Toggle right panel (tabs)", icon: Keyboard },
  { keys: ["B"], desc: "Toggle both panels", icon: Keyboard },
  { keys: ["Ctrl", "F"], desc: "Find in document (open search)", icon: Search },
  { keys: ["Ctrl", "Z"], desc: "Undo last annotation (in annotate mode)", icon: Undo2 },
  { keys: ["Ctrl", "Y"], desc: "Redo annotation (in annotate mode)", icon: Redo2 },
  { keys: ["←"], desc: "Previous page", icon: ArrowLeft },
  { keys: ["→"], desc: "Next page", icon: ArrowRight },
  { keys: ["Esc"], desc: "Close overlays / exit annotate mode", icon: Keyboard },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" /> Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>Speed up your workflow with these shortcuts.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          {SHORTCUTS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.desc} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent/40">
                <div className="flex items-center gap-2.5">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{s.desc}</span>
                </div>
                <div className="flex items-center gap-1">
                  {s.keys.map((k) => (
                    <kbd
                      key={k}
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground shadow-sm"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
