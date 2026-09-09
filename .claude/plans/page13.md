# Page 13: WebSocket API

# Objective
A WebSocket server sharing the controller's existing HTTP server, broadcasting
every published `DomainEvent` (page10's `EventBus`) to connected clients as
the versioned `WsEnvelope` protocol already defined in `packages/protocol`
(page2's `ws-protocol.ts` — `WsEnvelopeSchema`, `WS_PROTOCOL_VERSION`,
`DOMAIN_EVENT_TO_WS_TYPE`), with lightweight per-connection session
filtering and dead-connection cleanup.

# Why
ARCHITECTURE.md's REALTIME API section requires the mobile app to receive
live session status, output, and completion events. page10 built the
publish side (`EventBus`); nothing yet delivers those events anywhere a
client can receive them in real time — `GET /:id/events` (page10) is
pull-only history.

# Design decisions
- **Transport**: the `ws` library, attached to the same `http.Server`
  Express already listens on (`{ server: httpServer, path: "/ws" }`) — one
  port, no second listener to manage or document.
- **Subscribe/broadcast**: every client receives every event by default
  (simplest correct behavior — a dashboard showing "what's active across
  all projects" needs that). A client can send `{"type":"subscribe",
  "sessionId":"..."}` to narrow to one session (useful for a session-detail
  screen) and `{"type":"unsubscribe"}` to go back to everything. No
  per-project filter yet — not asked for, and `projectId` is already on
  every envelope for client-side filtering if needed.
- **Reconnect-friendly handshake**: no event replay/backfill on reconnect
  (that needs a cursor into `EventRepository`, a real feature not scoped
  here — `GET /:id/events` already covers "catch up on history" via a
  regular reconnect + REST call, which is a reasonable Phase 1 answer).
  "Reconnect-friendly" here concretely means: a ping/pong heartbeat that
  terminates dead sockets, so a client that reconnects after a network blip
  gets a clean new connection instead of the server holding a zombie one
  open indefinitely.
- **No auth yet** — page14 (pairing) is next; this page's scope is strictly
  the protocol and delivery mechanism.

# Implementation
1. `apps/controller/package.json` — add `ws` + `@types/ws`.
2. `api/ws/translate-to-ws-envelope.ts` — `translateToWsEnvelope(event:
   DomainEvent): WsEnvelope`, using the existing `DOMAIN_EVENT_TO_WS_TYPE`
   map (already exhaustive over `DomainEventType` per page2's compile-time
   check, so this never fails to find a mapping).
3. `api/ws/server.ts` — `attachWebSocketServer(httpServer, eventBus,
   logger): WebSocketServer`: per-connection state (`isAlive`,
   `sessionFilter`), subscribe/unsubscribe message handling, heartbeat
   interval (ping every 30s, terminate if the previous ping went
   unanswered), and an `EventBus` subscription that broadcasts translated
   envelopes to every open, filter-matching client. Unsubscribes from the
   bus and clears the heartbeat timer when the WS server closes.
4. `lifecycle.ts` — attaches the WS server to the same `http.Server`
   `app.listen` returns; `stop()` terminates open WS connections and closes
   the WS server before closing the HTTP server, so shutdown doesn't hang
   on lingering sockets.

# Files Changed
New: `api/ws/{translate-to-ws-envelope,server}.ts` (+ tests). Modified:
`apps/controller/package.json`, `lifecycle.ts`.

# Tests
`translateToWsEnvelope` unit tests (schema-valid output for every
`DomainEventType`). `server.ts` integration tests using a real `node:http`
server + a real `ws` client: default broadcast delivery, `subscribe`
narrowing delivery to one session, `unsubscribe` reverting to broadcast,
and a dead client (no pong response) getting terminated. `npm run
typecheck`, `npm run lint`, `npm test` green from root.

# Acceptance Criteria
- [ ] Every `DomainEvent` published on the bus reaches every connected,
      filter-matching WS client as a schema-valid `WsEnvelope`.
- [ ] `subscribe`/`unsubscribe` correctly narrow/widen delivery — verified
      by test, not just by review.
- [ ] Shutdown (`Controller.stop()`) does not hang with open WS connections
      — verified by test.
- [ ] All tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- No reconnect backfill means a client that's briefly disconnected misses
  events in between — mitigated today only by pairing a reconnect with a
  `GET /:id/events` call; a proper cursor-based catch-up is a reasonable
  future enhancement, not built here to avoid guessing at its shape.
- Broadcasting everything to everyone doesn't scale past Phase 1's expected
  single-user, few-sessions usage — fine for now, revisit only if it
  becomes a real problem (matches the project's stated anti-overengineering
  stance).

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page14.md` written (pairing & auth) before starting page14
