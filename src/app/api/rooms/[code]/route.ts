import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { roomCodeSchema } from "@/lib/validation";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(1, "Room name required").max(60, "Name too long").optional(),
  password: z.string().trim().min(1, "Password required").max(100, "Password too long").optional(),
  removePassword: z.boolean().optional(),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const upper = code.trim().toUpperCase();

  const room = await db.room.findUnique({
    where: { code: upper },
    include: {
      pdfs: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          originalName: true,
          fileSize: true,
          uploadedByName: true,
          createdAt: true,
        },
      },
    },
  });

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  // If the room has a password, require it via ?password= query (or X-Password header)
  if (room.passwordHash) {
    const url = new URL(req.url, "http://localhost");
    const provided = url.searchParams.get("password") || req.headers.get("x-room-password") || "";
    if (!verifyPassword(provided, room.passwordHash)) {
      return NextResponse.json(
        { error: "Room is locked", locked: true },
        { status: 401 }
      );
    }
  }

  return NextResponse.json({
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      createdAt: room.createdAt,
      hasPassword: !!room.passwordHash,
    },
    pdfs: room.pdfs,
  });
}

// PATCH update room name and/or password
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const codeCheck = roomCodeSchema.safeParse(code.trim().toUpperCase());
  if (!codeCheck.success) return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  const upper = codeCheck.data;

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const data: any = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.removePassword) {
    data.passwordHash = null;
  } else if (parsed.data.password !== undefined) {
    data.passwordHash = hashPassword(parsed.data.password);
  }

  const room = await db.room.update({
    where: { code: upper },
    data,
    select: { id: true, code: true, name: true, passwordHash: true },
  });

  return NextResponse.json({
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      hasPassword: !!room.passwordHash,
    },
  });
}

// DELETE a room (and all its PDFs, chat, markers, notes, annotations via cascade)
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const codeCheck = roomCodeSchema.safeParse(code.trim().toUpperCase());
  if (!codeCheck.success) return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
  const upper = codeCheck.data;

  await db.room.delete({ where: { code: upper } });
  return NextResponse.json({ ok: true });
}
