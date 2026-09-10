import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { Logger } from "@claudeops/logging";
import type { EventBus } from "../../domain/events/bus.js";
import type { PairingRegistry } from "../../domain/pairing/registry.js";
import { translateToWsEnvelope } from "./translate-to-ws-envelope.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

interface ClientState {
  isAlive: boolean;
  sessionFilter: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Attaches a WebSocket server to the controller's existing HTTP server
 * (one port, no second listener). Broadcasts every published DomainEvent
 * to every connected client by default; a client can narrow delivery to
 * one session via {"type":"subscribe","sessionId":"..."} and go back to
 * everything via {"type":"unsubscribe"}. A ping/pong heartbeat terminates
 * dead connections so a reconnecting client gets a clean socket instead of
 * the server holding a zombie one open (see .claude/plans/page13.md — no
 * event replay/backfill on reconnect; pair a reconnect with
 * GET /sessions/:id/events for history).
 *
 * Requires `?token=<pairing token>` on the connection URL (page18: this
 * server attaches to the raw http.Server's `upgrade` event, so Express's
 * auth middleware — page14 — never runs for it; found and fixed once
 * mobile became the first real WS consumer). React Native's `WebSocket`
 * doesn't support custom headers on connect the way node's `ws` client
 * does, so a query param is the practical choice here.
 */
export interface AttachWebSocketServerOptions {
  heartbeatIntervalMs?: number;
}

export function attachWebSocketServer(
  httpServer: Server,
  eventBus: EventBus,
  pairingRegistry: PairingRegistry,
  logger: Logger,
  options: AttachWebSocketServerOptions = {}
): WebSocketServer {
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    verifyClient: (info, callback) => {
      const token = new URL(info.req.url ?? "", "http://internal").searchParams.get("token");
      if (!token) {
        callback(false, 401, "missing token");
        return;
      }
      pairingRegistry
        .verifyToken(token)
        .then((valid) => callback(valid, valid ? undefined : 401, valid ? undefined : "invalid token"))
        .catch(() => callback(false, 401, "invalid token"));
    },
  });
  const clientState = new WeakMap<WebSocket, ClientState>();

  wss.on("connection", (ws: WebSocket) => {
    clientState.set(ws, { isAlive: true, sessionFilter: null });
    logger.info("ws client connected");

    ws.on("pong", () => {
      const state = clientState.get(ws);
      if (state) {
        state.isAlive = true;
      }
    });

    ws.on("message", (raw: Buffer) => {
      let message: unknown;
      try {
        message = JSON.parse(raw.toString("utf-8"));
      } catch {
        return;
      }
      if (!isRecord(message)) {
        return;
      }
      const state = clientState.get(ws);
      if (!state) {
        return;
      }
      if (message.type === "subscribe" && typeof message.sessionId === "string") {
        state.sessionFilter = message.sessionId;
      } else if (message.type === "unsubscribe") {
        state.sessionFilter = null;
      }
    });

    ws.on("close", () => {
      logger.info("ws client disconnected");
    });

    ws.on("error", (err: Error) => {
      logger.warn("ws client error", { error: err.message });
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const state = clientState.get(ws);
      if (!state) {
        continue;
      }
      if (!state.isAlive) {
        ws.terminate();
        continue;
      }
      state.isAlive = false;
      ws.ping();
    }
  }, heartbeatIntervalMs);
  heartbeat.unref();

  const unsubscribeFromBus = eventBus.subscribe((event) => {
    const envelope = translateToWsEnvelope(event);
    const payload = JSON.stringify(envelope);
    for (const ws of wss.clients) {
      if (ws.readyState !== WebSocket.OPEN) {
        continue;
      }
      const state = clientState.get(ws);
      if (state?.sessionFilter && event.sessionId !== state.sessionFilter) {
        continue;
      }
      ws.send(payload);
    }
  });

  wss.on("close", () => {
    clearInterval(heartbeat);
    unsubscribeFromBus();
  });

  return wss;
}
