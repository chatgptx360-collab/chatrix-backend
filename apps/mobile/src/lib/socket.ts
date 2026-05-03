import { io, Socket } from "socket.io-client";
import { useEffect, useRef, useState } from "react";
import type { ClientToServerEvents, ServerToClientEvents } from "@chatrix/shared/events";
import { useAuthStore } from "./auth/store";

/**
 * Single shared socket instance. One TCP connection per app session — joined
 * rooms are reused when the user navigates between chats.
 *
 * Re-auths automatically on token refresh by reading the latest access token
 * from the auth store on each (re)connect.
 */
const URL = process.env.EXPO_PUBLIC_WS_URL ?? "ws://localhost:4000";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (socket && socket.connected) return socket;
  if (socket) {
    socket.auth = { token: useAuthStore.getState().accessToken };
    socket.connect();
    return socket;
  }
  socket = io(URL, {
    transports: ["websocket"],
    auth: { token: useAuthStore.getState().accessToken },
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 600,
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

/**
 * React hook for connection status. Components don't usually need this — they
 * subscribe to specific events via `useSocketEvent` — but the chat list shows
 * a "reconnecting…" pill when offline.
 */
export function useSocketStatus() {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const s = getSocket();
    setConnected(s.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    return () => { s.off("connect", onConnect); s.off("disconnect", onDisconnect); };
  }, []);
  return connected;
}

/**
 * Typed event subscription. Cleans up on unmount and across handler renders
 * via a ref so callers can pass inline functions without triggering churn.
 */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = getSocket();
    const wrapped = ((...args: unknown[]) => (ref.current as any)(...args)) as ServerToClientEvents[E];
    s.on(event as any, wrapped as any);
    return () => { s.off(event as any, wrapped as any); };
  }, [event]);
}
