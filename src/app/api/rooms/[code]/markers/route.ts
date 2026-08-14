import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { roomCodeSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_COLORS = ["amber", "emerald", "rose", "violet"];

// GET all markers for a room
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

  const markers = await db.questionMarker.findMany({
    where: { roomId: room.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      pdfId: true,
      page: true,
      label: true,
      color: true,
      createdBy: true,
      createdByName: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    markers: markers.map((m) => ({
      ...m,
      color: (VALID_COLORS.includes(m.color) ? m.color : "amber") as any,
      createdAt: new Date(m.createdAt).getTime(),
    })),
  });
}

// POST create a marker
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
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";
  const color = VALID_COLORS.includes(body.color) ? body.color : "amber";
  const createdBy = typeof body.createdBy === "string" ? body.createdBy.slice(0, 40) : "";
  const createdByName = typeof body.createdByName === "string" ? body.createdByName.slice(0, 30) : "Anonymous";

  if (!pdfId || !page) return NextResponse.json({ error: "pdfId and page required" }, { status: 400 });

  const marker = await db.questionMarker.create({
    data: {
      roomId: room.id,
      pdfId,
      page,
      label: label || `Question on page ${page}`,
      color,
      createdBy,
      createdByName,
    },
  });

  return NextResponse.json({
    marker: {
      id: marker.id,
      pdfId: marker.pdfId,
      page: marker.page,
      label: marker.label,
      color: marker.color,
      createdBy: marker.createdBy,
      createdByName: marker.createdByName,
      createdAt: new Date(marker.createdAt).getTime(),
    },
  });
}

// DELETE a marker by id (via ?id= query)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const codeCheck = roomCodeSchema.safeParse(code.trim().toUpperCase());
  if (!codeCheck.success) return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  const upper = codeCheck.data;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const room = await db.room.findUnique({ where: { code: upper }, select: { id: true } });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  await db.questionMarker.deleteMany({ where: { id, roomId: room.id } });
  return NextResponse.json({ ok: true, id });
}
