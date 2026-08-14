"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useRoomSync } from "./room-sync-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Search,
  X,
  Loader2,
  ChevronUp,
  ChevronDown,
  FileSearch,
  AlertCircle,
} from "lucide-react";

// Worker is already configured in pdf-viewer.tsx; ensure it's set here too for safety.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface SearchResult {
  page: number;
  snippet: string;
  matchIndex: number;
}

export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const sync = useRoomSync();
  const { viewer, canControl } = sync;
  const pdfUrl = viewer.pdfId ? `/api/pdfs/${viewer.pdfId}` : null;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [searching, setSearching] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load the PDF document for text extraction (hidden, no rendering)
  useEffect(() => {
    setResults([]);
    setActiveIdx(0);
    setNumPages(0);
    setPdfDoc(null);
    setLoadError(null);
    if (!pdfUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const task = pdfjs.getDocument(pdfUrl);
        const doc = await task.promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || "Failed to load PDF for search");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  // Debounced search
  const runSearch = useCallback(
    async (q: string) => {
      if (!pdfDoc || !q.trim()) {
        setResults([]);
        setActiveIdx(0);
        return;
      }
      setSearching(true);
      const term = q.trim().toLowerCase();
      const found: SearchResult[] = [];
      try {
        for (let i = 1; i <= pdfDoc.numPages && found.length < 50; i++) {
          const page = await pdfDoc.getPage(i);
          const content = await page.getTextContent();
          const fullText = content.items
            .map((it: any) => (it.str ?? ""))
            .join(" ")
            .toLowerCase();
          let idx = fullText.indexOf(term);
          while (idx !== -1 && found.length < 50) {
            const start = Math.max(0, idx - 30);
            const end = Math.min(fullText.length, idx + term.length + 30);
            const snippet =
              (start > 0 ? "…" : "") +
              fullText.slice(start, end) +
              (end < fullText.length ? "…" : "");
            found.push({ page: i, snippet, matchIndex: idx });
            idx = fullText.indexOf(term, idx + 1);
          }
          page.cleanup();
        }
      } catch (e) {
        // ignore
      }
      setResults(found);
      setActiveIdx(0);
      setSearching(false);
    },
    [pdfDoc]
  );

  function handleQueryChange(value: string) {
    setQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => runSearch(value), 350);
  }

  function jumpToResult(idx: number) {
    if (!canControl || results.length === 0) return;
    const r = results[idx];
    if (!r) return;
    setActiveIdx(idx);
    sync.emitPage(r.page, numPages || viewer.totalPages);
  }

  function navResult(delta: number) {
    if (results.length === 0) return;
    const next = (activeIdx + delta + results.length) % results.length;
    jumpToResult(next);
  }

  if (!pdfUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <FileSearch className="h-8 w-8" />
        <p>Open a PDF to search its text.</p>
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
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Search</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* search input */}
      <div className="border-b p-2.5">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  navResult(e.shiftKey ? -1 : 1);
                } else if (e.key === "Escape") {
                  onClose();
                }
              }}
              placeholder="Find in document…"
              className="h-8 pl-7 pr-7 text-sm"
            />
            {searching && (
              <Loader2 className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navResult(-1)}
            disabled={results.length === 0 || !canControl}
            title="Previous match (Shift+Enter)"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navResult(1)}
            disabled={results.length === 0 || !canControl}
            title="Next match (Enter)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-0.5 text-[11px] text-muted-foreground">
          <span>
            {query.trim() === ""
              ? "Type to search across all pages"
              : results.length === 0
              ? searching
                ? "searching…"
                : "no matches"
              : `${activeIdx + 1} of ${results.length} matches`}
          </span>
          {!canControl && results.length > 0 && (
            <span className="text-amber-600">view-only</span>
          )}
        </div>
      </div>

      {/* results list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {loadError ? (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <AlertCircle className="h-8 w-8 text-destructive/60" />
              <p className="text-sm font-medium">Could not search</p>
              <p className="text-xs text-muted-foreground">{loadError}</p>
            </div>
          ) : results.length === 0 ? (
            query.trim() === "" ? (
              <div className="flex flex-col items-center gap-2 px-3 py-10 text-center text-muted-foreground">
                <FileSearch className="h-8 w-8" />
                <p className="text-xs">Search for keywords, question numbers, or terms across every page.</p>
              </div>
            ) : !searching ? (
              <div className="flex flex-col items-center gap-2 px-3 py-10 text-center text-muted-foreground">
                <p className="text-xs">No matches for "{query}"</p>
              </div>
            ) : null
          ) : (
            <ul className="space-y-1">
              {results.map((r, i) => (
                <li key={`${r.page}-${r.matchIndex}`}>
                  <button
                    onClick={() => jumpToResult(i)}
                    disabled={!canControl}
                    className={cn(
                      "group flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-50",
                      i === activeIdx
                        ? "border-emerald-500/60 bg-emerald-500/5"
                        : "border-transparent hover:border-border hover:bg-accent/50"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
                        i === activeIdx ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {r.page}
                    </span>
                    <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
                      {r.snippet}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
