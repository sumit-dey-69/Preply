"use client";

import { useEffect, useRef } from "react";
import { useRoomSync } from "./room-sync-provider";

/**
 * Plays a subtle chime + shows a desktop notification when a new chat message
 * arrives from someone else. Requests notification permission on first mount.
 */
export function useChatNotifications() {
  const sync = useRoomSync();
  const { chat, me } = sync;
  const lastLenRef = useRef(chat.length);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // request notification permission once
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      // don't auto-prompt aggressively; only if user has interacted
      const handler = () => {
        if (Notification.permission === "default") {
          Notification.requestPermission().catch(() => {});
        }
        window.removeEventListener("click", handler);
      };
      window.addEventListener("click", handler, { once: true });
    }
  }, []);

  useEffect(() => {
    if (chat.length <= lastLenRef.current) {
      lastLenRef.current = chat.length;
      return;
    }
    const newMessages = chat.slice(lastLenRef.current);
    lastLenRef.current = chat.length;

    for (const msg of newMessages) {
      // skip own messages
      if (msg.authorId === me?.sessionId) continue;
      playChime();
      showNotification(msg.authorName, msg.text);
    }
  }, [chat, me?.sessionId]);

  function playChime() {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.26);
    } catch {
      // ignore audio errors
    }
  }

  function showNotification(author: string, text: string) {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      if (document.visibilityState === "visible") return; // only when tab hidden
      const n = new Notification(`${author} in Preply`, {
        body: text.slice(0, 200),
        tag: "livepdf-chat",
        silent: true, // we play our own chime
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      setTimeout(() => n.close(), 5000);
    } catch {
      // ignore
    }
  }
}
