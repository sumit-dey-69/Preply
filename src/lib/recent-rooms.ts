"use client";

export interface RecentRoom {
  code: string;
  name: string;
  joinedAt: number;
}

const KEY = "livepdf:recent-rooms";
const MAX = 6;

export function loadRecentRooms(): RecentRoom[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.code === "string" && typeof r.name === "string")
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function addRecentRoom(code: string, name: string): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadRecentRooms();
    const filtered = existing.filter((r) => r.code !== code);
    filtered.unshift({ code, name, joinedAt: Date.now() });
    window.localStorage.setItem(KEY, JSON.stringify(filtered.slice(0, MAX)));
  } catch {
    // ignore
  }
}

export function removeRecentRoom(code: string): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadRecentRooms();
    const filtered = existing.filter((r) => r.code !== code);
    window.localStorage.setItem(KEY, JSON.stringify(filtered));
  } catch {
    // ignore
  }
}
