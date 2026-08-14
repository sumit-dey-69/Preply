"use client";

import { useEffect, useState } from "react";
import { pdfjs } from "react-pdf";
import { useRoomSync } from "./room-sync-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ListTree, X, Loader2, FileText } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface OutlineItem {
  title: string;
  pageNumber: number | null;
  dest?: any;
  items: OutlineItem[];
  depth: number;
}

interface RawOutline {
  title: string;
  bold: boolean;
  italic: boolean;
  color: number[];
  dest: any;
  items: RawOutline[];
}

export function OutlineOverlay({ onClose }: { onClose: () => void }) {
  const sync = useRoomSync();
  const { viewer, canControl } = sync;
  const pdfUrl = viewer.pdfId ? `/api/pdfs/${viewer.pdfId}` : null;

  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the PDF document for outline extraction
  useEffect(() => {
    setOutline([]);
    setError(null);
    setPdfDoc(null);
    if (!pdfUrl) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const task = pdfjs.getDocument(pdfUrl);
        const doc = await task.promise;
        if (cancelled) return;
        setPdfDoc(doc);

        // Try to get the outline (bookmarks / table of contents)
        const raw = await doc.getOutline();
        if (cancelled) return;
        if (!raw || raw.length === 0) {
          setOutline([]);
          setLoading(false);
          return;
        }

        // Resolve each outline item to a page number
        const resolved = await resolveOutline(raw, doc, 0);
        if (cancelled) return;
        setOutline(resolved);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Failed to load outline");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  async function resolveOutline(items: RawOutline[], doc: any, depth: number): Promise<OutlineItem[]> {
    const result: OutlineItem[] = [];
    for (const item of items) {
      let pageNumber: number | null = null;
      if (item.dest) {
        try {
          let dest = item.dest;
          if (typeof dest === "string") {
            dest = await doc.getDestination(dest);
          }
          if (Array.isArray(dest) && dest.length > 0) {
            const ref = dest[0];
            const pageIndex = await doc.getPageIndex(ref);
            pageNumber = pageIndex + 1;
          }
        } catch {
          // ignore resolution errors
        }
      }
      const subItems = item.items && item.items.length > 0
        ? await resolveOutline(item.items, doc, depth + 1)
        : [];
      result.push({
        title: item.title,
        pageNumber,
        depth,
        items: subItems,
      });
    }
    return result;
  }

  function jumpToPage(page: number) {
    if (!canControl || !page) return;
    sync.emitPage(page, viewer.totalPages);
  }

  if (!pdfUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <FileText className="h-8 w-8" />
        <p>Open a PDF to see its outline.</p>
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
          <ListTree className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Outline</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Could not load outline: {error}
            </div>
          ) : outline.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-10 text-center text-muted-foreground">
              <ListTree className="h-8 w-8" />
              <p className="text-xs">This PDF has no outline or table of contents.</p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {outline.map((item, i) => (
                <OutlineRow
                  key={i}
                  item={item}
                  currentPage={viewer.currentPage || 1}
                  onJump={jumpToPage}
                  canControl={canControl}
                />
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function OutlineRow({
  item,
  currentPage,
  onJump,
  canControl,
}: {
  item: OutlineItem;
  currentPage: number;
  onJump: (page: number) => void;
  canControl: boolean;
}) {
  const isActive = item.pageNumber === currentPage;
  return (
    <>
      <button
        disabled={!canControl || !item.pageNumber}
        onClick={() => item.pageNumber && onJump(item.pageNumber)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
          "hover:bg-accent/50 disabled:opacity-50 disabled:hover:bg-transparent",
          isActive && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
          !isActive && "text-foreground"
        )}
        style={{ paddingLeft: 8 + item.depth * 12 }}
      >
        {item.pageNumber ? (
          <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-muted px-1 text-[9px] font-bold text-muted-foreground">
            {item.pageNumber}
          </span>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate">{item.title}</span>
      </button>
      {item.items.map((child, i) => (
        <OutlineRow
          key={i}
          item={child}
          currentPage={currentPage}
          onJump={onJump}
          canControl={canControl}
        />
      ))}
    </>
  );
}
