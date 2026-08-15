"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useRoomSync } from "./room-sync-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCw,
  Maximize,
  Loader2,
  FileText,
  RotateCcw,
  Bookmark,
  LayoutGrid,
  Search,
  Pencil,
  Download,
  ListTree,
  MoreVertical,
} from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "@/lib/constants";
import { ThumbnailsOverlay } from "./thumbnails-overlay";
import { SearchOverlay } from "./search-overlay";
import { OutlineOverlay } from "./outline-overlay";
import { AnnotationLayer } from "./annotation-layer";
import { AnnotationToolbar } from "./annotation-toolbar";
import { cn } from "@/lib/utils";
import { exportPageAsPng } from "@/lib/export-page";
import type { AnnotationTool, AnnotationColor } from "@/lib/types";

// Worker is served from /public/pdf.worker.min.mjs (copied at build time).
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

export function PdfViewer() {
  const sync = useRoomSync();
  const { viewer, canControl } = sync;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const applyingRemoteRef = useRef(false);
  const lastScrollEmitRef = useRef(0);

  const [numPages, setNumPages] = useState<number>(0);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageInput, setPageInput] = useState<number>(viewer.currentPage || 1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [annTool, setAnnTool] = useState<AnnotationTool | null>(null);
  const [annColor, setAnnColor] = useState<AnnotationColor>("amber");

  const pdfUrl = viewer.pdfId ? `/api/pdfs/${viewer.pdfId}` : null;
  const zoom = viewer.zoom || 1;
  const rotation = viewer.rotation || 0;
  const effectiveWidth = Math.max(200, containerWidth * zoom - 0);

  // --- measure container width ---
  // Re-runs when the PDF loads/unloads (pdfUrl changes), because the scroll
  // container div is only rendered when a PDF is open — on first mount
  // (no PDF selected) scrollRef.current is null and the observer can't attach.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth - 24; // padding
      setContainerWidth((prev) => (prev === w ? prev : w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdfUrl, showThumbnails, showSearch, showOutline]);

  // --- fullscreen change ---
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // --- keyboard shortcuts (Ctrl+F search, Ctrl+Z undo, arrows page nav, Escape) ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // don't intercept when typing in an input/textarea
      const target = e.target as HTMLElement;
      const isTyping = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key === "f" && viewer.pdfId) {
        e.preventDefault();
        setShowSearch((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && annTool !== null) {
        e.preventDefault();
        sync.undoAnnotation();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey)) && annTool !== null) {
        e.preventDefault();
        sync.redoAnnotation();
        return;
      }
      if (e.key === "Escape" && (showSearch || showThumbnails || showOutline || annTool !== null)) {
        setShowSearch(false);
        setShowThumbnails(false);
        setShowOutline(false);
        setAnnTool(null);
        return;
      }
      if (isTyping) return;
      // arrow-key page navigation (only when not typing and can control)
      if (e.key === "ArrowLeft" && canControl && viewer.pdfId) {
        e.preventDefault();
        goToPage((viewer.currentPage || 1) - 1);
      }
      if (e.key === "ArrowRight" && canControl && viewer.pdfId) {
        e.preventDefault();
        goToPage((viewer.currentPage || 1) + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer.pdfId, viewer.currentPage, showSearch, showThumbnails, annTool, canControl]);

  // --- keep page input in sync ---
  useEffect(() => {
    setPageInput(viewer.currentPage || 1);
  }, [viewer.currentPage]);

  // --- scroll to a page (local helper, sets flag) ---
  const scrollToPage = useCallback((page: number) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const idx = Math.max(0, Math.min(page - 1, (pageRefs.current.length || 0) - 1));
    const target = pageRefs.current[idx];
    if (target) {
      applyingRemoteRef.current = true;
      scrollEl.scrollTo({ top: target.offsetTop - 8, behavior: "auto" });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyingRemoteRef.current = false;
        });
      });
    }
  }, []);

  // --- PDF load handlers ---
  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setLoadError(null);
      // sync total pages to the room
      sync.emitPage(viewer.currentPage || 1, numPages);
      // after layout, apply the current scroll/page state from room
      requestAnimationFrame(() => {
        const scrollEl = scrollRef.current;
        if (!scrollEl) return;
        if (viewer.scrollY && viewer.scrollY > 0) {
          applyingRemoteRef.current = true;
          const max = scrollEl.scrollHeight - scrollEl.clientHeight;
          scrollEl.scrollTop = viewer.scrollY * Math.max(max, 1);
          requestAnimationFrame(() => {
            applyingRemoteRef.current = false;
          });
        } else {
          scrollToPage(viewer.currentPage || 1);
        }
      });
    },
    [viewer.pdfId]
  );

  const onDocumentLoadError = useCallback((err: Error) => {
    console.error("[pdf] load error", err);
    setLoadError(err?.message || "Failed to load PDF");
    setNumPages(0);
  }, []);

  // --- apply remote scroll (viewer.scrollY/scrollX are 0..1 ratios) ---
  // Only when the last change was an explicit scroll event from someone else.
  useEffect(() => {
    if (viewer.kind !== "scroll") return;
    if (viewer.changedBy === sync.me?.sessionId || viewer.changedBy == null) return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    applyingRemoteRef.current = true;
    // Apply vertical scroll
    const maxY = scrollEl.scrollHeight - scrollEl.clientHeight;
    scrollEl.scrollTop = (viewer.scrollY || 0) * Math.max(maxY, 1);
    // Apply horizontal scroll (when zoomed in wider than viewport)
    const maxX = scrollEl.scrollWidth - scrollEl.clientWidth;
    if (maxX > 0) {
      scrollEl.scrollLeft = (viewer.scrollX || 0) * maxX;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyingRemoteRef.current = false;
      });
    });
  }, [viewer.scrollY, viewer.scrollX, viewer.kind, viewer.changedAt, sync.me?.sessionId]);

  // --- apply remote page change (explicit page nav, not scroll-induced) ---
  useEffect(() => {
    if (viewer.kind !== "page") return;
    if (viewer.changedBy === sync.me?.sessionId) return;
    if (numPages <= 0) return;
    scrollToPage(viewer.currentPage);
  }, [viewer.currentPage, viewer.kind, viewer.changedAt, numPages]);

  // --- local scroll handler (throttled leading emit + trailing flush) ---
  // Leading: emit at most every ~80ms during active scrolling.
  // Trailing: always emit the final resting position ~120ms after scrolling stops,
  // so the other participant converges to the exact same spot.
  const pendingScrollRef = useRef<{ x: number; y: number; page: number } | null>(null);
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const computeScrollState = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return null;
    let currentPage = 1;
    const refs = pageRefs.current;
    for (let i = 0; i < refs.length; i++) {
      const el = refs[i];
      if (!el) continue;
      if (el.offsetTop - 12 <= scrollEl.scrollTop) currentPage = i + 1;
      else break;
    }
    const max = scrollEl.scrollHeight - scrollEl.clientHeight;
    const ratioY = max > 0 ? scrollEl.scrollTop / max : 0;
    const ratioX = scrollEl.scrollWidth > scrollEl.clientWidth ? scrollEl.scrollLeft / (scrollEl.scrollWidth - scrollEl.clientWidth) : 0;
    return { x: ratioX, y: ratioY, page: currentPage };
  }, []);

  const handleScroll = useCallback(() => {
    if (applyingRemoteRef.current) return;
    const state = computeScrollState();
    if (!state) return;
    pendingScrollRef.current = state;
    const now = Date.now();
    // leading emit
    if (now - lastScrollEmitRef.current >= 80) {
      lastScrollEmitRef.current = now;
      sync.emitScroll(state.x, state.y, state.page);
    }
    // trailing flush
    if (trailingTimerRef.current) clearTimeout(trailingTimerRef.current);
    trailingTimerRef.current = setTimeout(() => {
      const s = pendingScrollRef.current;
      if (!s) return;
      lastScrollEmitRef.current = Date.now();
      sync.emitScroll(s.x, s.y, s.page);
    }, 120);
  }, [sync, computeScrollState]);

  // --- control actions ---
  const goToPage = (p: number) => {
    if (!canControl) return;
    const page = Math.max(1, Math.min(numPages || viewer.totalPages || 1, p));
    scrollToPage(page);
    sync.emitPage(page, numPages || viewer.totalPages);
  };

  const changeZoom = (delta: number) => {
    // Always allow zoom (works even if socket is briefly down — local state updates)
    sync.emitZoom(clampZoom((viewer.zoom || 1) + delta));
    // After zoom changes, emit scroll position so the other user follows
    setTimeout(() => {
      const state = computeScrollState();
      if (state) sync.emitScroll(state.x, state.y, state.page);
    }, 150);
  };
  const setZoom = (z: number) => {
    sync.emitZoom(clampZoom(z));
    // After zoom changes, emit scroll position so the other user follows
    setTimeout(() => {
      const state = computeScrollState();
      if (state) sync.emitScroll(state.x, state.y, state.page);
    }, 150);
  };

  // --- Ctrl/Cmd + wheel = zoom (desktop standard + trackpad pinch) ---
  // Uses a ref to hold the latest zoom value so the listener doesn't need to
  // be re-attached on every zoom change (avoids stale closures + missed events).
  const currentZoomRef = useRef(zoom);
  currentZoomRef.current = zoom;
  const emitZoomRef = useRef(sync.emitZoom);
  emitZoomRef.current = sync.emitZoom;
  const emitScrollRef = useRef(sync.emitScroll);
  emitScrollRef.current = sync.emitScroll;
  const computeScrollStateRef = useRef(computeScrollState);
  computeScrollStateRef.current = computeScrollState;
  const pdfIdRef = useRef(viewer.pdfId);
  pdfIdRef.current = viewer.pdfId;

  useEffect(() => {
    if (!pdfUrl) return;
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const overPdf =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!overPdf) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!pdfIdRef.current) return;
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const newZoom = clampZoom((currentZoomRef.current || 1) + delta);
      emitZoomRef.current(newZoom);
      // After zoom, emit scroll position so the other user follows
      setTimeout(() => {
        const state = computeScrollStateRef.current();
        if (state) emitScrollRef.current(state.x, state.y, state.page);
      }, 150);
    };
    document.addEventListener("wheel", handler, { passive: false, capture: true });
    return () => {
      document.removeEventListener("wheel", handler, { capture: true } as any);
    };
  }, [pdfUrl, computeScrollState]);

  const rotate = () => {
    if (!canControl) return;
    sync.emitRotation(((viewer.rotation || 0) + 90) % 360);
  };
  const fitWidth = () => setZoom(1);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const zoomLabel = zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`;

  // --- empty state ---
  if (!pdfUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <FileText className="h-7 w-7" />
        </div>
        <div>
          <p className="font-medium">No PDF open</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a PDF from the list on the left, or upload one to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col rounded-xl border bg-card overflow-hidden">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/40 px-2.5 py-1.5">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goToPage((viewer.currentPage || 1) - 1)} disabled={!canControl || (viewer.currentPage || 1) <= 1} title="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5">
            <Input
              className="h-8 w-12 px-1 text-center text-sm"
              value={pageInput || 1}
              inputMode="numeric"
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                setPageInput(isNaN(n) ? 1 : n);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") goToPage(pageInput || 1);
              }}
              disabled={!canControl}
            />
            <span className="text-xs text-muted-foreground">/ {numPages || viewer.totalPages || "—"}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goToPage((viewer.currentPage || 1) + 1)} disabled={!canControl || (viewer.currentPage || 1) >= (numPages || viewer.totalPages || 1)} title="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mx-1 h-5 w-px bg-border" />

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeZoom(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <button
            onClick={fitWidth}
            className="h-8 min-w-[52px] rounded-md px-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
            title="Fit to width"
          >
            {zoomLabel}
          </button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeZoom(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* Annotate + Fullscreen (primary tools) */}
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", annTool !== null && "bg-emerald-500/15 text-emerald-600")}
          onClick={() => setAnnTool((t) => (t === null ? "pen" : null))}
          disabled={!viewer.pdfId}
          title="Annotate (draw / highlight)"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>

        {/* Secondary tools in a dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!viewer.pdfId} title="More tools">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setShowThumbnails((v) => !v)} className={cn(showThumbnails && "bg-accent")}>
              <LayoutGrid className="mr-2 h-4 w-4" /> Thumbnails
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowSearch((v) => !v)} className={cn(showSearch && "bg-accent")}>
              <Search className="mr-2 h-4 w-4" /> Find (Ctrl+F)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowOutline((v) => !v)} className={cn(showOutline && "bg-accent")}>
              <ListTree className="mr-2 h-4 w-4" /> Outline
            </DropdownMenuItem>
            <DropdownMenuItem onClick={rotate} disabled={!canControl}>
              <RotateCw className="mr-2 h-4 w-4" /> Rotate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => {
              if (!viewer.pdfId) return;
              const label = window.prompt("Label this question (optional):", `Question on page ${viewer.currentPage || 1}`);
              if (label === null) return;
              sync.addMarker(viewer.pdfId, viewer.currentPage || 1, label, "amber");
            }}>
              <Bookmark className="mr-2 h-4 w-4" /> Bookmark page
            </DropdownMenuItem>
            <DropdownMenuItem onClick={async () => {
              if (!viewer.pdfId) return;
              try {
                const pageAnnotations = sync.annotations
                  .filter((a) => a.pdfId === viewer.pdfId && a.page === (viewer.currentPage || 1))
                  .map((a) => ({ tool: a.tool, color: a.color, points: a.points }));
                await exportPageAsPng({
                  pdfUrl: `/api/pdfs/${viewer.pdfId}`,
                  page: viewer.currentPage || 1,
                  annotations: pageAnnotations,
                  filename: `page-${viewer.currentPage || 1}.png`,
                });
              } catch (e) { console.error("export failed", e); }
            }}>
              <Download className="mr-2 h-4 w-4" /> Export page as PNG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-2">
          {numPages > 0 && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Page {viewer.currentPage || 1} of {numPages}
            </span>
          )}
          {!canControl && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">
              View-only (presenter mode)
            </span>
          )}
        </div>
      </div>

      {/* document + optional thumbnails/search rail */}
      <div className="relative flex min-h-0 flex-1">
        {/* floating annotation toolbar */}
        {annTool !== null && viewer.pdfId && (
          <div className="absolute left-1/2 top-2 z-10 -translate-x-1/2">
            <AnnotationToolbar
              activeTool={annTool}
              onToolChange={setAnnTool}
              color={annColor}
              onColorChange={setAnnColor}
              onClose={() => setAnnTool(null)}
            />
          </div>
        )}
        {showThumbnails && (
          <div className="w-64 shrink-0 border-r bg-card">
            <ThumbnailsOverlay onClose={() => setShowThumbnails(false)} />
          </div>
        )}
        {showSearch && (
          <div className="w-72 shrink-0 border-r bg-card">
            <SearchOverlay onClose={() => setShowSearch(false)} />
          </div>
        )}
        {showOutline && (
          <div className="w-64 shrink-0 border-r bg-card">
            <OutlineOverlay onClose={() => setShowOutline(false)} />
          </div>
        )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="livepdf-scroll relative flex-1 overflow-auto bg-muted/20"
        style={{ scrollBehavior: "auto", touchAction: "pan-x pan-y" }}
      >
        {loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <RotateCcw className="h-7 w-7" />
            </div>
            <p className="font-medium">Could not open PDF</p>
            <p className="max-w-sm text-sm text-muted-foreground">{loadError}</p>
          </div>
        ) : (
          <div className="mx-auto flex w-full flex-col items-center gap-3 p-3" style={{ width: effectiveWidth ? effectiveWidth + 24 : "100%" }}>
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="flex h-64 w-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              }
              error={
                <div className="flex h-64 w-full items-center justify-center text-sm text-muted-foreground">
                  Failed to load PDF.
                </div>
              }
              className="w-full"
            >
              {Array.from(new Array(numPages)).map((_, i) => {
                const pageNo = i + 1;
                return (
                  <div
                    key={`page-${pageNo}`}
                    ref={(el) => {
                      pageRefs.current[i] = el;
                    }}
                    data-page-no={pageNo}
                    className={`relative w-full rounded-md bg-white shadow-sm ring-1 ring-black/5 ${
                      (viewer.currentPage || 1) === pageNo ? "ring-2 ring-emerald-500/60" : ""
                    }`}
                  >
                    <span className="absolute left-1/2 top-1 -translate-x-1/2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity hover:opacity-100">
                      {pageNo}
                    </span>
                    <Page
                      pageNumber={pageNo}
                      width={effectiveWidth}
                      rotate={rotation}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      loading={<div className="h-[600px] w-full animate-pulse bg-muted/40" />}
                      className="mx-auto"
                    />
                    {viewer.pdfId && (
                      <AnnotationLayer
                        pdfId={viewer.pdfId}
                        page={pageNo}
                        width={effectiveWidth}
                        height={effectiveWidth * 1.414}
                        active={annTool !== null}
                        tool={annTool ?? "pen"}
                        color={annColor}
                      />
                    )}
                    {/* search match indicator badge */}
                    {showSearch && sync.viewer.currentPage === pageNo && (
                      <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">
                        <Search className="h-2.5 w-2.5" /> match page
                      </div>
                    )}
                  </div>
                );
              })}
            </Document>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
