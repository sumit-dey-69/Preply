import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRoomSchema } from "@/lib/validation";
import { generateRoomCode } from "@/lib/constants";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = createRoomSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    const { name, hostName } = parsed.data;

    // Optional: invite-only + expiry (from body)
    const inviteOnly = body.inviteOnly === true;
    const expiryHours = typeof body.expiryHours === "number" && body.expiryHours > 0
      ? Math.min(body.expiryHours, 168) // max 7 days
      : null;

    let code = generateRoomCode();
    let existing = await db.room.findUnique({ where: { code } });
    let attempts = 0;
    while (existing && attempts < 8) {
      code = generateRoomCode();
      existing = await db.room.findUnique({ where: { code } });
      attempts++;
    }

    const inviteToken = inviteOnly ? randomBytes(8).toString("hex") : null;
    const expiresAt = expiryHours
      ? new Date(Date.now() + expiryHours * 3600 * 1000)
      : null;

    const room = await db.room.create({
      data: {
        code,
        name: name || `${hostName}'s Study Room`,
        inviteToken,
        expiresAt,
      },
    });

    return NextResponse.json({
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        createdAt: room.createdAt,
        inviteToken: room.inviteToken,
        expiresAt: room.expiresAt,
      },
    });
  } catch (e) {
    console.error("[api/rooms] create error", e);
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ service: "preply-rooms-api", ok: true });
}
