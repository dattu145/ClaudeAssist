import { useEffect, useState } from "react";
import { WsEnvelopeSchema, type WsEnvelope } from "@claudeops/protocol";

const MAX_BUFFERED_EVENTS = 100;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * Connects to the controller's `/ws?token=` stream (page18: the token query
 * param is required since RN's WebSocket can't send custom connect
 * headers — see api/ws/server.ts's docstring). Reconnects on close with
 * exponential backoff so a controller restart doesn't leave the app stuck,
 * and doesn't hammer it with a tight retry loop either. Optionally narrows
 * the stream to one session via the existing subscribe control message.
 */
export function useLiveEvents(
  baseUrl: string | null,
  token: string | null,
  sessionId?: string
): { events: WsEnvelope[]; connected: boolean } {
  const [events, setEvents] = useState<WsEnvelope[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setEvents([]);
    if (!baseUrl || !token) {
      setConnected(false);
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const wsUrl = `${baseUrl.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(token)}`;

    const connect = () => {
      if (cancelled) {
        return;
      }
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (cancelled) {
          return;
        }
        reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        setConnected(true);
        if (sessionId) {
          ws?.send(JSON.stringify({ type: "subscribe", sessionId }));
        }
      };

      ws.onmessage = (msg) => {
        if (cancelled) {
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(msg.data));
        } catch {
          return;
        }
        const envelope = WsEnvelopeSchema.safeParse(parsed);
        if (!envelope.success) {
          return;
        }
        setEvents((prev) => [...prev, envelope.data].slice(-MAX_BUFFERED_EVENTS));
      };

      ws.onclose = () => {
        if (cancelled) {
          return;
        }
        setConnected(false);
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      ws?.close();
    };
  }, [baseUrl, token, sessionId]);

  return { events, connected };
}
