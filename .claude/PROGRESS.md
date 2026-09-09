# Progress

**Current phase**: Phase 1
**Current page**: page14 (pairing & auth) — not started
**Completed pages**: page1 (project foundation & monorepo skeleton), page2
  (packages/protocol & packages/config), page3 (packages/logging), page4
  (controller foundation), page5 (session state machine + domain entities),
  page6 (Project Registry), page7 (ClaudeSessionAdapter interface +
  FakeClaudeSessionAdapter), page8 (ClaudeCodeAdapter — real implementation),
  page9 (Session Registry), page10 (event system + EventRepository),
  page11 (Task system), page12 (REST API completion), page13 (WebSocket API)
**Active work**: none
**Blocked work**: **git push access** — `dattu145/ClaudeAssist` push is
  failing with 403 (cached credentials are for a different GitHub account,
  `leadsprogress`, which lacks push access). Page10, page11, page12, and
  now page13 commits are sitting locally on `main`, unpushed. User needs to
  fix credentials/repo access before the next push.
**Known issues**: `npm install` reports 17 pre-existing vulnerabilities in
  transitive deps (mostly from the Expo scaffold + better-sqlite3's build
  chain) — not yet triaged; do not run `npm audit fix --force` without
  review, it can silently change majors.
**Next action**: write `.claude/plans/page14.md`, then implement it
**Last completed milestone**: page13 implemented and verified (2026-09-09) —
  `attachWebSocketServer` shares the controller's existing HTTP server (one
  port, `/ws` path) and broadcasts every published `DomainEvent` (page10's
  `EventBus`) to connected clients as the versioned `WsEnvelope` protocol
  (`packages/protocol`'s `ws-protocol.ts`, already defined since page2).
  Per-connection session filtering via `{"type":"subscribe","sessionId":
  "..."}` / `{"type":"unsubscribe"}`, and a ping/pong heartbeat (interval
  injectable for tests) that terminates dead connections. `lifecycle.ts`'s
  shutdown now explicitly terminates open WS connections and closes the WS
  server before the HTTP server, so stop() never hangs on a lingering
  socket. No auth yet (page14, next). Verified: typecheck/lint clean, 225
  default-suite tests passing across 41 files (including real
  `node:http` + real `ws`-client integration tests for broadcast,
  subscribe/unsubscribe, and malformed-message handling), and a real
  end-to-end manual run confirming a live WS client receives correctly
  schema-shaped events for session start/stop/resume and that shutdown
  completes cleanly with an open connection.
