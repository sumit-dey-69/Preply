"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useRoomSync } from "./room-sync-provider";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, LayoutGrid, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Worker is already configured in pdf-viewer.tsx; ensure it's set here too for safety.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export function ThumbnailsOverlay({ onClose }: { onClose: () => void }) {
  const sync = useRoomSync();
  const { viewer, canControl } = sync;
  const pdfUrl = viewer.pdfId ? `/api/pdfs/${viewer.pdfId}` : null;
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setNumPages(0);
    setLoadError(null);
  }, [viewer.pdfId]);

  function handleJump(page: number) {
    if (!canControl) return;
    sync.emitPage(page, numPages || viewer.totalPages);
  }

  if (!pdfUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <p>Open a PDF to see page thumbnails.</p>
        <Button variant="outline" size="sm" onClick={onClose} className="mt-1">
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Pages</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {numPages || viewer.totalPages || "—"}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {loadError ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Could not load thumbnails.
        </div>
      ) : (
        <div ref={scrollRef} className="livepdf-scroll flex-1 overflow-y-auto p-3">
          <Document
            file={pdfUrl}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            onLoadError={(e) => setLoadError(e?.message || "error")}
            loading={
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            {Array.from(new Array(numPages)).map((_, i) => {
              const pageNo = i + 1;
              const active = (viewer.currentPage || 1) === pageNo;
              return (
                <button
                  key={`thumb-${pageNo}`}
                  onClick={() => handleJump(pageNo)}
                  disabled={!canControl}
                  className={cn(
                    "group relative flex flex-col items-center gap-1.5 rounded-lg border bg-white p-1.5 transition-all hover:shadow-md disabled:opacity-50",
                    active ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-border"
                  )}
                >
                  <div className="relative w-full overflow-hidden rounded">
                    <Page
                      pageNumber={pageNo}
                      width={120}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      loading={<div className="h-[170px] w-full animate-pulse bg-muted/40" />}
                      className="mx-auto"
                    />
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium tabular-nums",
                      active ? "text-emerald-600" : "text-muted-foreground"
                    )}
                  >
                    {pageNo}
                  </span>
                  {active && (
                    <span className="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">
                      ●
                    </span>
                  )}
                </button>
              );
            })}
          </Document>
        </div>
      )}
    </div>
  );
}
