"use client";

import { io, Socket } from "socket.io-client";
import { SYNC_SOCKET_PORT } from "./constants";
import type { ClientToServerEvents, ServerToClientEvents } from "./types";

export type LivePdfSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: LivePdfSocket | null = null;

/**
 * Singleton socket connection.
 *
 * In the sandbox, always connects through the Caddy gateway using the
 * XTransformPort query param (path is always "/" so Caddy can route it).
 * For local dev, the user can set NEXT_PUBLIC_SYNC_URL to point to the
 * sync service directly (e.g. http://localhost:3002).
 */
export function getSocket(): LivePdfSocket {
  if (socketInstance) return socketInstance;

  const directUrl = process.env.NEXT_PUBLIC_SYNC_URL;

  if (directUrl) {
    // Local dev: connect directly to the sync service URL
    socketInstance = io(directUrl, {
      transports: ["websocket", "polling"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      autoConnect: true,
    });
  } else {
    // Sandbox / production: route through Caddy via the transform-port query param
    socketInstance = io("/?XTransformPort=" + SYNC_SOCKET_PORT, {
      transports: ["websocket", "polling"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      autoConnect: true,
    });
  }

  return socketInstance;
}

export function disposeSocket(): void {
  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
  }
}
