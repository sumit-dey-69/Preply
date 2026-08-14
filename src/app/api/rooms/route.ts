import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createRoomSchema } from "@/lib/validation";
import { generateRoomCode } from "@/lib/constants";

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

    let code = generateRoomCode();
    let existing = await db.room.findUnique({ where: { code } });
    let attempts = 0;
    while (existing && attempts < 8) {
      code = generateRoomCode();
      existing = await db.room.findUnique({ where: { code } });
      attempts++;
    }

    const room = await db.room.create({
      data: {
        code,
        name: name || `${hostName}'s Study Room`,
      },
    });

    return NextResponse.json({
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        createdAt: room.createdAt,
      },
    });
  } catch (e) {
    console.error("[api/rooms] create error", e);
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ service: "livepdf-rooms-api", ok: true });
}
