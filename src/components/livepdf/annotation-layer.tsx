"use client";

import { useEffect, useRef, useState } from "react";
import { useRoomSync } from "./room-sync-provider";
import { cn } from "@/lib/utils";
import type { Annotation, AnnotationTool, AnnotationColor } from "@/lib/types";

const COLOR_HEX: Record<AnnotationColor, string> = {
  amber: "#f59e0b",
  emerald: "#10b981",
  rose: "#f43f5e",
  violet: "#8b5cf6",
  sky: "#0ea5e9",
};

const COLOR_FILL: Record<AnnotationColor, string> = {
  amber: "rgba(245, 158, 11, 0.35)",
  emerald: "rgba(16, 185, 129, 0.35)",
  rose: "rgba(244, 63, 94, 0.35)",
  violet: "rgba(139, 92, 246, 0.35)",
  sky: "rgba(14, 165, 233, 0.35)",
};

const TOOLS: { value: AnnotationTool; label: string; icon: string }[] = [
  { value: "highlight", label: "Highlight", icon: "Highlighter" },
  { value: "pen", label: "Pen", icon: "Pen" },
  { value: "rect", label: "Rectangle", icon: "Square" },
  { value: "erase", label: "Erase", icon: "Eraser" },
];

const COLORS: AnnotationColor[] = ["amber", "emerald", "rose", "violet", "sky"];

function pointsToPath(points: { x: number; y: number }[], w: number, h: number) {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${(p.x * w).toFixed(1)} ${(p.y * h).toFixed(1)}`).join(" ");
}

function rectFromPoints(points: { x: number; y: number }[], w: number, h: number) {
  if (points.length < 2) return null;
  const x0 = Math.min(points[0].x, points[1].x) * w;
  const y0 = Math.min(points[0].y, points[1].y) * h;
  const x1 = Math.max(points[0].x, points[1].x) * w;
  const y1 = Math.max(points[0].y, points[1].y) * h;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

interface Props {
  pdfId: string;
  page: number;
  width: number;
  height: number;
  active: boolean;
  tool: AnnotationTool;
  color: AnnotationColor;
}

export function AnnotationLayer({ pdfId, page, width, height, active, tool, color }: Props) {
  const sync = useRoomSync();
  const { annotations, canControl, me } = sync;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drawingRef = useRef(false);
  const currentPointsRef = useRef<{ x: number; y: number }[]>([]);
  const [previewPoints, setPreviewPoints] = useState<{ x: number; y: number }[]>([]);

  const pageAnnotations = annotations.filter((a) => a.pdfId === pdfId && a.page === page);

  function getRelativePos(e: React.PointerEvent) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!active || !canControl) return;
    if (tool === "erase") {
      // erase: find annotation near click and remove
      const pos = getRelativePos(e);
      const tolerance = 0.02;
      const target = pageAnnotations.find((a) =>
        a.points.some((p) => Math.abs(p.x - pos.x) < tolerance && Math.abs(p.y - pos.y) < tolerance)
      );
      if (target) sync.removeAnnotation(target.id);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pos = getRelativePos(e);
    currentPointsRef.current = tool === "rect" ? [pos, pos] : [pos];
    setPreviewPoints([...currentPointsRef.current]);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    const pos = getRelativePos(e);
    if (tool === "rect") {
      currentPointsRef.current = [currentPointsRef.current[0], pos];
    } else {
      currentPointsRef.current.push(pos);
    }
    setPreviewPoints([...currentPointsRef.current]);
  }

  function handlePointerUp(_e: React.PointerEvent) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const pts = [...currentPointsRef.current];
    currentPointsRef.current = [];
    setPreviewPoints([]);
    // simplify: for pen/highlight, drop points that are too close together
    let finalPoints = pts;
    if (tool === "pen" || tool === "highlight") {
      finalPoints = pts.filter((p, i) => {
        if (i === 0) return true;
        const prev = pts[i - 1];
        return Math.hypot(p.x - prev.x, p.y - prev.y) > 0.005;
      });
    }
    if (finalPoints.length >= 2) {
      sync.addAnnotation(pdfId, page, tool, color, finalPoints);
    } else if (finalPoints.length === 1 && (tool === "pen" || tool === "highlight")) {
      // single tap — make a tiny dot
      const p = finalPoints[0];
      sync.addAnnotation(pdfId, page, tool, color, [p, { x: p.x + 0.005, y: p.y + 0.005 }]);
    }
  }

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 h-full w-full"
      style={{
        touchAction: active ? "none" : "auto",
        cursor: active ? (tool === "erase" ? "cell" : "crosshair") : "default",
        pointerEvents: active ? "auto" : "auto",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* existing annotations */}
      {pageAnnotations.map((ann) => {
        const stroke = COLOR_HEX[ann.color];
        const fill = COLOR_FILL[ann.color];
        if (ann.tool === "pen") {
          return (
            <path
              key={ann.id}
              d={pointsToPath(ann.points, width, height)}
              stroke={stroke}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="group-hover:opacity-70"
            />
          );
        }
        if (ann.tool === "highlight") {
          return (
            <path
              key={ann.id}
              d={pointsToPath(ann.points, width, height)}
              stroke={fill}
              strokeWidth={18}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.6}
            />
          );
        }
        if (ann.tool === "rect") {
          const r = rectFromPoints(ann.points, width, height);
          if (!r) return null;
          return (
            <g key={ann.id}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill="none"
                stroke={stroke}
                strokeWidth={2}
                strokeDasharray="6 4"
                rx={3}
              />
            </g>
          );
        }
        return null;
      })}

      {/* live preview while drawing */}
      {previewPoints.length >= 2 && (
        <>
          {tool === "rect" ? (
            (() => {
              const r = rectFromPoints(previewPoints, width, height);
              if (!r) return null;
              return (
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.h}
                  fill="none"
                  stroke={COLOR_HEX[color]}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  rx={3}
                  opacity={0.7}
                />
              );
            })()
          ) : tool === "highlight" ? (
            <path
              d={pointsToPath(previewPoints, width, height)}
              stroke={COLOR_FILL[color]}
              strokeWidth={18}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.6}
            />
          ) : (
            <path
              d={pointsToPath(previewPoints, width, height)}
              stroke={COLOR_HEX[color]}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.7}
            />
          )}
        </>
      )}
    </svg>
  );
}

export { COLOR_HEX, COLOR_FILL, TOOLS, COLORS };
