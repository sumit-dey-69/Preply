import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readPdfFile, deletePdfFile } from "@/lib/pdf-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pdf = await db.pDF.findUnique({ where: { id } });
  if (!pdf) {
    return NextResponse.json({ error: "PDF not found" }, { status: 404 });
  }
  try {
    const buf = await readPdfFile(pdf.storedName);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buf.length),
        "Content-Disposition": `inline; filename="${encodeURIComponent(pdf.originalName)}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (e) {
    console.error("[api/pdfs] read error", e);
    return NextResponse.json({ error: "PDF file missing" }, { status: 410 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pdf = await db.pDF.findUnique({ where: { id } });
  if (!pdf) {
    return NextResponse.json({ error: "PDF not found" }, { status: 404 });
  }
  await deletePdfFile(pdf.storedName);
  await db.pDF.delete({ where: { id } });
  return NextResponse.json({ ok: true, id });
}
