import { z } from "zod";
import { MAX_PDF_SIZE, ROOM_CODE_REGEX } from "./constants";

export const roomCodeSchema = z.string().regex(ROOM_CODE_REGEX, "Invalid room code");

export const createRoomSchema = z.object({
  name: z.string().trim().max(60).optional(),
  hostName: z.string().trim().min(1, "Please enter a display name").max(30, "Name too long"),
});

export const joinRoomSchema = z.object({
  code: z.string().trim().toUpperCase().regex(ROOM_CODE_REGEX, "Invalid room code"),
  displayName: z.string().trim().min(1, "Please enter a display name").max(30, "Name too long"),
});

export const participantIdSchema = z.string().trim().min(1).max(40);

export function sanitizeFilename(name: string): string {
  // Keep the last segment only, strip path traversal, restrict charset.
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "document.pdf";
  const cleaned = base
    .replace(/\.\.+/g, "")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : "document.pdf";
}

export function validatePdfFile(file: File): { ok: boolean; error?: string } {
  if (!file) return { ok: false, error: "No file provided" };
  const name = file.name.toLowerCase();
  const isPdfName = name.endsWith(".pdf");
  const isPdfMime = file.type === "application/pdf";
  // Accept by either name or mime, but reject if neither signals PDF.
  if (!isPdfName && !isPdfMime) {
    return { ok: false, error: "Only PDF files are allowed" };
  }
  if (file.size <= 0) return { ok: false, error: "File is empty" };
  if (file.size > MAX_PDF_SIZE) {
    return { ok: false, error: `File too large (max ${Math.round(MAX_PDF_SIZE / 1024 / 1024)}MB)` };
  }
  return { ok: true };
}
