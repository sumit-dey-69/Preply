"use client";

const PARTICIPANT_KEY = "livepdf:participant";

export interface LocalParticipant {
  sessionId: string;
  displayName: string;
}

/** Persist a stable session id + display name for this browser. */
export function loadLocalParticipant(): LocalParticipant | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PARTICIPANT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.sessionId === "string" && typeof parsed.displayName === "string") {
      return parsed as LocalParticipant;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLocalParticipant(p: LocalParticipant): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PARTICIPANT_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

export function ensureLocalParticipant(displayName?: string): LocalParticipant {
  if (typeof window !== "undefined") {
    const existing = loadLocalParticipant();
    if (existing) return existing;
    const id = generateSessionId();
    const name = (displayName?.trim() || "").length > 0 ? displayName!.trim() : `Guest-${id.slice(0, 4).toUpperCase()}`;
    const p = { sessionId: id, displayName: name };
    saveLocalParticipant(p);
    return p;
  }
  return { sessionId: generateSessionId(), displayName: displayName || "Guest" };
}

export function setDisplayName(name: string): LocalParticipant {
  const existing = loadLocalParticipant();
  const p: LocalParticipant = {
    sessionId: existing?.sessionId ?? generateSessionId(),
    displayName: name.trim() || "Guest",
  };
  saveLocalParticipant(p);
  return p;
}

function generateSessionId(): string {
  // RFC4122-ish v4 using crypto when available
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
