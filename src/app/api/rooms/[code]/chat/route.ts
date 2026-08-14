import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { roomCodeSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET chat history for a room (paginated, newest last)
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

  const messages = await db.chatMessage.findMany({
    where: { roomId: room.id },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      authorId: true,
      authorName: true,
      text: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      roomCode: upper,
      authorId: m.authorId,
      authorName: m.authorName,
      text: m.text,
      createdAt: new Date(m.createdAt).getTime(),
    })),
  });
}

// POST create a chat message (persistence — the realtime broadcast is via socket)
export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const codeCheck = roomCodeSchema.safeParse(code.trim().toUpperCase());
  if (!codeCheck.success) return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  const upper = codeCheck.data;

  const room = await db.room.findUnique({ where: { code: upper }, select: { id: true } });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
  const authorId = typeof body.authorId === "string" ? body.authorId.slice(0, 40) : "";
  const authorName = typeof body.authorName === "string" ? body.authorName.slice(0, 30) : "Anonymous";
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const msg = await db.chatMessage.create({
    data: { roomId: room.id, authorId, authorName, text },
  });

  return NextResponse.json({
    message: {
      id: msg.id,
      roomCode: upper,
      authorId: msg.authorId,
      authorName: msg.authorName,
      text: msg.text,
      createdAt: new Date(msg.createdAt).getTime(),
    },
  });
}
