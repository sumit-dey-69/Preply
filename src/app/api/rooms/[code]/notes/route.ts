import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { roomCodeSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET the shared note for a room (creates an empty one if missing)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const codeCheck = roomCodeSchema.safeParse(code.trim().toUpperCase());
  if (!codeCheck.success) return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  const upper = codeCheck.data;

  const room = await db.room.findUnique({ where: { code: upper }, select: { id: true } });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  let note = await db.sharedNote.findUnique({ where: { roomId: room.id } });
  if (!note) {
    note = await db.sharedNote.create({ data: { roomId: room.id, content: "" } });
  }

  return NextResponse.json({
    note: {
      id: note.id,
      roomId: note.roomId,
      content: note.content,
      updatedAt: new Date(note.updatedAt).getTime(),
      updatedBy: note.updatedBy,
      updatedByName: note.updatedByName,
    },
  });
}

// PUT update the shared note content
export async function PUT(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const codeCheck = roomCodeSchema.safeParse(code.trim().toUpperCase());
  if (!codeCheck.success) return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  const upper = codeCheck.data;

  const room = await db.room.findUnique({ where: { code: upper }, select: { id: true } });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.slice(0, 20000) : "";
  const updatedBy = typeof body.updatedBy === "string" ? body.updatedBy.slice(0, 40) : null;
  const updatedByName = typeof body.updatedByName === "string" ? body.updatedByName.slice(0, 30) : null;

  const note = await db.sharedNote.upsert({
    where: { roomId: room.id },
    update: { content, updatedBy, updatedByName },
    create: { roomId: room.id, content, updatedBy, updatedByName },
  });

  return NextResponse.json({
    note: {
      id: note.id,
      roomId: note.roomId,
      content: note.content,
      updatedAt: new Date(note.updatedAt).getTime(),
      updatedBy: note.updatedBy,
      updatedByName: note.updatedByName,
    },
  });
}
