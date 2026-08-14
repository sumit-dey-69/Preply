import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { savePdfFile, generateStoredName } from "@/lib/pdf-storage";
import { validatePdfFile, roomCodeSchema, sanitizeFilename } from "@/lib/validation";
import { MAX_PDF_SIZE } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
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
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  return NextResponse.json({ pdfs: room.pdfs });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const codeCheck = roomCodeSchema.safeParse(code.trim().toUpperCase());
    if (!codeCheck.success) {
      return NextResponse.json({ error: "Invalid room code" }, { status: 400 });
    }
    const upper = codeCheck.data;

    const room = await db.room.findUnique({ where: { code: upper } });
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const form = await req.formData();
    const file = form.get("file");
    const uploadedByName = (form.get("uploadedByName") as string | null)?.trim().slice(0, 30) || null;
    const uploadedById = (form.get("uploadedById") as string | null)?.trim().slice(0, 40) || null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const check = validatePdfFile(file);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    if (file.size > MAX_PDF_SIZE) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    const originalName = sanitizeFilename(file.name);
    const storedName = generateStoredName(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = await savePdfFile(buffer, storedName);

    const pdf = await db.pDF.create({
      data: {
        roomId: room.id,
        originalName,
        storedName,
        mimeType: "application/pdf",
        fileSize: file.size,
        storagePath,
        uploadedById,
        uploadedByName,
      },
    });

    return NextResponse.json({
      pdf: {
        id: pdf.id,
        originalName: pdf.originalName,
        fileSize: pdf.fileSize,
        uploadedByName: pdf.uploadedByName,
        createdAt: pdf.createdAt,
      },
    });
  } catch (e) {
    console.error("[api/pdfs] upload error", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
