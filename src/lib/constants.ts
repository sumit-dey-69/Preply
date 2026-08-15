// Shared constants for LivePDF Room

export const SYNC_SOCKET_PORT = 3002;

// Room code: 6 chars, no ambiguous chars (0/O, 1/I)
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
export const CODE_ALPHABET_EXPORT = CODE_ALPHABET;

export function generateRoomCode(): string {
  let out = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export const MAX_PDF_SIZE = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_PDF_MIME = ["application/pdf"];
export const ALLOWED_PDF_EXTS = ["pdf"];

export const SCROLL_THROTTLE_MS = 80;
export const ZOOM_THROTTLE_MS = 120;
export const PAGE_THROTTLE_MS = 60;

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.15;
export const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

export const COUNTDOWN_PRESETS_MIN = [1, 5, 10, 15, 30, 60];

export const ROOM_CODE_REGEX = /^[A-Z2-9]{6}$/;
