"use client";

import { pdfjs } from "react-pdf";

// Ensure worker is configured
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/**
 * Render a specific PDF page (with optional annotations overlaid) to a canvas
 * and trigger a PNG download.
 *
 * Annotations are drawn using normalized 0..1 coordinates so they scale to any
 * render size.
 */
export async function exportPageAsPng(opts: {
  pdfUrl: string;
  page: number;
  annotations?: {
    tool: "highlight" | "pen" | "rect" | "erase";
    color: "amber" | "emerald" | "rose" | "violet" | "sky";
    points: { x: number; y: number }[];
  }[];
  scale?: number;
  filename?: string;
}): Promise<void> {
  const { pdfUrl, page, annotations = [], scale = 2, filename } = opts;

  // Load the PDF document
  const task = pdfjs.getDocument(pdfUrl);
  const doc = await task.promise;
  const pdfPage = await doc.getPage(page);

  // Determine the viewport at the requested scale
  const baseViewport = pdfPage.getViewport({ scale: 1 });
  const renderScale = scale * (800 / baseViewport.width); // target ~800px wide for crisp export
  const viewport = pdfPage.getViewport({ scale: renderScale });

  // Render the PDF page to a canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await pdfPage.render({
    canvasContext: ctx,
    viewport,
    canvas,
  } as any).promise;

  // Overlay annotations
  const COLOR_HEX: Record<string, string> = {
    amber: "#f59e0b",
    emerald: "#10b981",
    rose: "#f43f5e",
    violet: "#8b5cf6",
    sky: "#0ea5e9",
  };
  const COLOR_FILL: Record<string, string> = {
    amber: "rgba(245, 158, 11, 0.35)",
    emerald: "rgba(16, 185, 129, 0.35)",
    rose: "rgba(244, 63, 94, 0.35)",
    violet: "rgba(139, 92, 246, 0.35)",
    sky: "rgba(14, 165, 233, 0.35)",
  };

  for (const ann of annotations) {
    const w = canvas.width;
    const h = canvas.height;
    const pts = ann.points.map((p) => ({ x: p.x * w, y: p.y * h }));

    if (ann.tool === "pen") {
      ctx.strokeStyle = COLOR_HEX[ann.color] || "#f59e0b";
      ctx.lineWidth = 2.5 * renderScale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    } else if (ann.tool === "highlight") {
      ctx.strokeStyle = COLOR_FILL[ann.color] || "rgba(245,158,11,0.35)";
      ctx.lineWidth = 18 * renderScale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (ann.tool === "rect" && pts.length >= 2) {
      const x0 = Math.min(pts[0].x, pts[1].x);
      const y0 = Math.min(pts[0].y, pts[1].y);
      const x1 = Math.max(pts[0].x, pts[1].x);
      const y1 = Math.max(pts[0].y, pts[1].y);
      ctx.strokeStyle = COLOR_HEX[ann.color] || "#f59e0b";
      ctx.lineWidth = 2 * renderScale;
      ctx.setLineDash([6 * renderScale, 4 * renderScale]);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
    }
  }

  // Trigger download
  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename || `page-${page}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // cleanup
  pdfPage.cleanup();
  doc.destroy();
}
