import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { sanitizeFilename } from "./validation";

// On Vercel/serverless, use /tmp (the only writable directory).
// On local/Docker, use a local storage folder.
const STORAGE_DIR = process.env.VERCEL
  ? path.join("/tmp", "storage", "pdfs")
  : path.join(process.cwd(), "storage", "pdfs");

export async function ensureStorageDir(): Promise<string> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  return STORAGE_DIR;
}

export function getStorageDir(): string {
  return STORAGE_DIR;
}

/** Generate a unique, opaque stored filename. Original name is never trusted. */
export function generateStoredName(originalName: string): string {
  const safe = sanitizeFilename(originalName);
  const ext = path.extname(safe).toLowerCase() || ".pdf";
  const id = randomBytes(10).toString("hex");
  const ts = Date.now().toString(36);
  return `${ts}-${id}${ext}`;
}

export async function savePdfFile(file: Buffer, storedName: string): Promise<string> {
  await ensureStorageDir();
  const target = path.join(STORAGE_DIR, storedName);
  // Final guard: ensure storedName has no path separators.
  const base = path.basename(target);
  const finalPath = path.join(STORAGE_DIR, base);
  await fs.writeFile(finalPath, file);
  return finalPath;
}

export async function readPdfFile(storedName: string): Promise<Buffer> {
  const base = path.basename(storedName);
  const finalPath = path.join(STORAGE_DIR, base);
  return fs.readFile(finalPath);
}

export async function deletePdfFile(storedName: string): Promise<void> {
  const base = path.basename(storedName);
  const finalPath = path.join(STORAGE_DIR, base);
  try {
    await fs.unlink(finalPath);
  } catch (e) {
    // ignore missing file
  }
}

export async function pdfExists(storedName: string): Promise<boolean> {
  const base = path.basename(storedName);
  const finalPath = path.join(STORAGE_DIR, base);
  try {
    await fs.access(finalPath);
    return true;
  } catch {
    return false;
  }
}
