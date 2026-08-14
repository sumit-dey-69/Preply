import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { roomCodeSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TOOLS = ["highlight", "pen", "rect", "erase"];
const VALID_COLORS = ["amber", "emerald", "rose", "violet", "sky"];

// GET all annotations for a room
export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const codeCheck = roomCodeSchema.safeParse(code.trim().toUpperCase());
  if (!codeCheck.success) return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  const upper = codeCheck.data;

  const room = await db.room.findUnique({
    where: { code: upper },
    select: { id: true },
  });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const rows = await db.annotation.findMany({
    where: { roomId: room.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      pdfId: true,
      page: true,
      tool: true,
      color: true,
      points: true,
      createdBy: true,
      createdByName: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    annotations: rows.map((r) => ({
      id: r.id,
      pdfId: r.pdfId,
      page: r.page,
      tool: (VALID_TOOLS.includes(r.tool) ? r.tool : "pen") as any,
      color: (VALID_COLORS.includes(r.color) ? r.color : "amber") as any,
      points: safeParsePoints(r.points),
      createdBy: r.createdBy,
      createdByName: r.createdByName,
      createdAt: new Date(r.createdAt).getTime(),
    })),
  });
}

// POST create an annotation (persistence — the realtime broadcast is via socket)
export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const codeCheck = roomCodeSchema.safeParse(code.trim().toUpperCase());
  if (!codeCheck.success) return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  const upper = codeCheck.data;

  const room = await db.room.findUnique({ where: { code: upper }, select: { id: true } });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const pdfId = typeof body.pdfId === "string" ? body.pdfId : null;
  const page = typeof body.page === "number" && body.page >= 1 ? body.page : null;
  const tool = VALID_TOOLS.includes(body.tool) ? body.tool : "pen";
  const color = VALID_COLORS.includes(body.color) ? body.color : "amber";
  const createdBy = typeof body.createdBy === "string" ? body.createdBy.slice(0, 40) : "";
  const createdByName = typeof body.createdByName === "string" ? body.createdByName.slice(0, 30) : "Anonymous";

  if (!pdfId || !page) return NextResponse.json({ error: "pdfId and page required" }, { status: 400 });

  let points: { x: number; y: number }[] = [];
  if (Array.isArray(body.points)) {
    points = body.points
      .slice(0, 2000)
      .map((p: any) => ({
        x: typeof p?.x === "number" ? Math.max(0, Math.min(1, p.x)) : 0,
        y: typeof p?.y === "number" ? Math.max(0, Math.min(1, p.y)) : 0,
      }))
      .filter((p) => p !== null);
  }
  if (points.length === 0) return NextResponse.json({ error: "points required" }, { status: 400 });

  const row = await db.annotation.create({
    data: {
      roomId: room.id,
      pdfId,
      page,
      tool,
      color,
      points: JSON.stringify(points),
      createdBy,
      createdByName,
    },
  });

  return NextResponse.json({
    annotation: {
      id: row.id,
      pdfId: row.pdfId,
      page: row.page,
      tool: row.tool,
      color: row.color,
      points,
      createdBy: row.createdBy,
      createdByName: row.createdByName,
      createdAt: new Date(row.createdAt).getTime(),
    },
  });
}

// DELETE an annotation by id (via ?id= query) — or clear a page (via ?pdfId=&page=)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const codeCheck = roomCodeSchema.safeParse(code.trim().toUpperCase());
  if (!codeCheck.success) return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  const upper = codeCheck.data;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const pdfId = url.searchParams.get("pdfId");
  const pageStr = url.searchParams.get("page");

  const room = await db.room.findUnique({ where: { code: upper }, select: { id: true } });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  if (id) {
    await db.annotation.deleteMany({ where: { id, roomId: room.id } });
    return NextResponse.json({ ok: true, id });
  }
  if (pdfId && pageStr) {
    const page = parseInt(pageStr, 10);
    if (!isNaN(page) && page >= 1) {
      await db.annotation.deleteMany({ where: { roomId: room.id, pdfId, page } });
      return NextResponse.json({ ok: true, pdfId, page });
    }
  }
  return NextResponse.json({ error: "id or (pdfId + page) required" }, { status: 400 });
}

function safeParsePoints(s: string): { x: number; y: number }[] {
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p: any) => p && typeof p.x === "number" && typeof p.y === "number")
      .slice(0, 2000)
      .map((p: any) => ({ x: p.x, y: p.y }));
  } catch {
    return [];
  }
}
