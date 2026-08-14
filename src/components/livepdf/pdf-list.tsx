"use client";

import { useRef, useState } from "react";
import { useRoomSync } from "./room-sync-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, Trash2, Loader2, Check, Inbox } from "lucide-react";
import { formatBytes } from "./utils";

export function PdfList() {
  const sync = useRoomSync();
  const { pdfs, viewer, canControl } = sync;
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let okCount = 0;
    let lastError = "";
    for (const file of Array.from(files)) {
      const success = await sync.uploadPdf(file);
      if (success) okCount++;
      else lastError = file.name;
    }
    setUploading(false);
    if (okCount > 0) {
      toast({ title: `${okCount} PDF${okCount > 1 ? "s" : ""} uploaded`, description: "Available to everyone in the room." });
      if (okCount === 1 && pdfs.length === 0) {
        // auto-select first uploaded pdf if none was open
        // find the newly added pdf — but we don't have its id here easily; rely on state update
      }
    }
    if (lastError) {
      toast({ title: `Could not upload ${lastError}`, variant: "destructive" });
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This removes it for everyone in the room.`)) return;
    const ok = await sync.deletePdf(id);
    toast(ok ? { title: "PDF deleted" } : { title: "Delete failed", variant: "destructive" });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">PDF Files</h3>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {pdfs.length}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {pdfs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-3 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Inbox className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">No PDFs yet</p>
              <p className="text-xs text-muted-foreground">Upload a question paper to start solving together.</p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-1 h-8 gap-1.5 text-xs"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-3.5 w-3.5" /> Upload PDF
              </Button>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {pdfs.map((pdf) => {
                const active = viewer.pdfId === pdf.id;
                return (
                  <li key={pdf.id}>
                    <div
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
                        active
                          ? "border-emerald-500/60 bg-emerald-500/5"
                          : "border-transparent hover:border-border hover:bg-accent/50"
                      )}
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        onClick={() => canControl && sync.selectPdf(pdf.id)}
                        disabled={!canControl}
                      >
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                            active ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                          )}
                        >
                          PDF
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate text-sm font-medium", active && "text-emerald-700 dark:text-emerald-400")}>
                            {pdf.originalName}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {formatBytes(pdf.fileSize)}
                            {pdf.uploadedByName ? ` · ${pdf.uploadedByName}` : ""}
                          </p>
                        </div>
                        {active && (
                          <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(pdf.id, pdf.originalName)}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
