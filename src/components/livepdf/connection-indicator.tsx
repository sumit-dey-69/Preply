"use client";

import { useRoomSync, type ConnectionStatus } from "./room-sync-provider";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Loader2 } from "lucide-react";

const LABELS: Record<ConnectionStatus, string> = {
  connected: "Live Sync",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
};

export function ConnectionIndicator() {
  const { connection, latencyMs } = useRoomSync();
  const color =
    connection === "connected"
      ? "text-emerald-600"
      : connection === "disconnected"
      ? "text-destructive"
      : "text-amber-600";
  const Icon = connection === "connected" ? Wifi : connection === "disconnected" ? WifiOff : Loader2;
  const animated = connection === "connecting" || connection === "reconnecting";

  // latency quality color
  const latencyColor =
    connection !== "connected"
      ? ""
      : latencyMs < 50
      ? "text-emerald-500"
      : latencyMs < 150
      ? "text-amber-500"
      : "text-rose-500";

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className="relative flex h-2 w-2">
        {connection === "connected" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            connection === "connected" && "bg-emerald-500",
            connection === "disconnected" && "bg-destructive",
            (connection === "connecting" || connection === "reconnecting") && "bg-amber-500"
          )}
        />
      </span>
      <Icon className={cn("h-3.5 w-3.5", color, animated && "animate-spin")} />
      <span className={color}>{LABELS[connection]}</span>
      {connection === "connected" && latencyMs > 0 && (
        <span className={cn("ml-1 font-mono text-[10px] tabular-nums", latencyColor)} title="Connection latency (one-way)">
          {latencyMs}ms
        </span>
      )}
    </span>
  );
}
