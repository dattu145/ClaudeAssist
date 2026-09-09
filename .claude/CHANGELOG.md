# Changelog

## 2026-09-09
- Repo inspection performed (Node v24.16.0, npm 11.13.0, Claude Code CLI
  2.1.266, git 2.54.0, no pnpm installed, not yet a git repo, Windows 11).
- Researched Claude Code CLI integration surface (research/claude-code.md).
- Wrote architecture, decisions (ADR-001..005), risks, security, test plan,
  and Phase 1 page roadmap (MASTER_PLAN.md).
- Implemented page1: git init, npm workspaces monorepo skeleton
  (`apps/controller`, `apps/mobile` via `create-expo-app` blank-typescript,
  `packages/shared`), TS project references, ESLint flat config + Prettier,
  root Vitest config, `.env.example`. Verified install/typecheck/lint/test
  and Expo boot (expo-doctor 21/21, Metro starts).
- Committed and pushed page1 to `origin/main`
  (https://github.com/dattu145/ClaudeAssist).
- Implemented page2: `packages/protocol` (Project/ClaudeSession/Task/
  DomainEvent Zod schemas, session state-transition table, versioned WS
  envelope, REST request/response schemas) and `packages/config`
  (Zod-validated env config, aggregated error messages). Wired into
  `apps/controller`. 35 tests passing, lint/typecheck clean.
- Committed and pushed page2 to `origin/main`.
- Implemented page3: `packages/logging` (structured JSON-line logger, level
  filtering shared with `packages/config`'s `LOG_LEVEL`, unconditional
  denylist redaction, `.child()` scoping, rotation strategy documented and
  deliberately deferred to page21). Wired into `apps/controller`, replacing
  `console.log`. 46 tests passing, lint/typecheck clean.
- Committed and pushed page3 to `origin/main`.
- Implemented page4: controller foundation — Express app with `/health`,
  SQLite bootstrap (WAL mode) + hand-rolled migration runner, graceful
  SIGINT/SIGTERM shutdown, request-scoped logging. Widened `PORT` in
  `packages/config` to accept 0 (OS-assigned ephemeral port, used by tests).
  Fixed a Windows-specific bug where `claude --version` failed via
  `execFile` (needs a shell to resolve the `.cmd` shim) — now uses `exec`,
  documented in research/claude-code.md. Added `pretest` (`tsc -b`) to the
  root `test` script after a stale cross-package build masked a real test
  failure. 63 tests passing, lint/typecheck clean.
- Committed and pushed page4 to `origin/main`.
- Implemented page5: `packages/shared` gained `generateId`/`nowIso` utility
  functions. `apps/controller/src/domain/session/state-machine.ts`
  (`applyTransition`) is now the single enforced path for session status
  changes — invalid transitions are logged and no-op, never applied
  silently. `entity.ts` (`createSession`/`transitionSession`) builds on it,
  is immutable, and self-validates against `ClaudeSessionSchema`. 77 tests
  passing, lint/typecheck clean.
- Committed and pushed page5 to `origin/main`.
- Implemented page6: Project Registry — the first real business feature.
  `createProject`/`validateProjectPath` (domain/project/entity.ts),
  `ProjectRepository` interface + `SqliteProjectRepository` impl,
  `ProjectRegistry` service (path validation, `ProjectNotFoundError`),
  mounted at `POST/GET /projects` and `GET /projects/:id`. Added a generic
  `DomainError` base class and `domainErrorHttpStatus` code-prefix mapping
  in `server.ts`'s error handler so later pages (session/task registries)
  can add new error types without touching the HTTP layer again. 98 tests
  passing, lint/typecheck clean.
- Committed and pushed page6 to `origin/main`.
- Implemented page7: `ClaudeSessionAdapter` port
  (`domain/session/adapter.ts`) and `FakeClaudeSessionAdapter`
  (`adapters/fake/`), built before the real Claude Code adapter so page9+
  can be developed and tested without shelling out to the real CLI. The
  fake drives sessions through the real page5 state machine, is scriptable
  via `queueInstructionOutcome`, and models a synchronous per-session event
  subscription. Added `SessionNotFoundError`. 110 tests passing,
  lint/typecheck clean.
- Committed and pushed page7 to `origin/main`.
- Implemented page8: real `ClaudeCodeAdapter`. Probed the live `claude` CLI
  directly (user-approved, small real API spend) and found the original
  `--bg`-based design unworkable (`--bg`/`-p` are mutually exclusive,
  `--session-id` is ignored under `--bg`, a `--bg` session can't be
  `--resume`d until stopped) — corrected research/claude-code.md and
  redesigned around plain resumable `-p --session-id`/`-p --resume`
  conversations only. Outcome mapping grounded in a real captured
  stream-json transcript (`permission_denials` -> `WAITING_FOR_PERMISSION`,
  `is_error` -> `FAILED`, else `COMPLETED`; `WAITING_FOR_INPUT` documented
  as unreachable). Changed `discoverSessions`'s return type to a new
  `DiscoveredClaudeProcess` type (no `projectId` at the process level).
  Caught and fixed two real bugs via testing: a stale-closure race letting
  a completing dispatch clobber a concurrent `stopSession()`, and a
  Windows `spawn EINVAL` on `.cmd` files without `shell: true` (verified
  the fix doesn't reintroduce injection risk by testing an actual payload).
  132 default-suite tests passing (2 opt-in real-CLI tests, run separately
  against the live CLI, also passing).
- Committed and pushed page8 to `origin/main`.
- Implemented page9: `SessionRegistry` (SQLite-backed, wraps
  `ClaudeSessionAdapter`, mirrors page6's entity/repository/registry
  pattern). `sessions` table with FK-blocks-delete against `projects`
  (deliberate). Added `getSession` to the `ClaudeSessionAdapter` port
  (`getStatus` alone wasn't enough for accurate persistence). Caught and
  fixed a real bug via integration testing: `lastOutput`/`lastError`/
  `currentTask` were schema fields since page2 that neither adapter ever
  actually populated — fixed in both `FakeClaudeSessionAdapter` and
  `ClaudeCodeAdapter`. No HTTP routes yet (deferred to page12). 149
  default-suite tests passing; both opt-in real-CLI tests re-verified
  passing after the adapter changes.
- Committed and pushed page9 to `origin/main`.
- Implemented page10: `InProcessEventBus`, `translateSessionEvent`
  (`SessionAdapterEvent` -> `DomainEvent`), `SqliteEventRepository`, and
  `wireEventPersistence`. `GET /sessions/:id/events` is live.
  `lifecycle.ts` wires the real `ClaudeCodeAdapter` into the running
  controller for the first time. Found and fixed a real timing bug before
  it shipped: `SessionRegistry` subscribed to adapter events after
  `startSession` resolved, silently missing an initial-instruction
  dispatch's own events — fixed by generating the session id upfront and
  subscribing before calling the adapter. Verified by a regression test
  and a real end-to-end manual run. 173 default-suite tests passing,
  lint/typecheck clean.
- Attempted to push page10 to `origin/main`: failed with a 403 — cached git
  credentials on this machine belong to a different GitHub account
  (`leadsprogress`) without push access to `dattu145/ClaudeAssist`. Commit
  remains local pending a credentials fix.
- Implemented page11: `Task` entity/state machine
  (`TASK_STATUS_TRANSITIONS` added to `packages/protocol`, `RUNNING ->
  CANCELLED` deliberately unsupported), `TaskRepository`/
  `SqliteTaskRepository`, and `TaskRegistry` wrapping
  `SessionRegistry.sendInstruction` so every dispatch produces a persisted
  Task. `startedAt`/`completedAt` bookkeeping centralized in
  `transitionTask`. A task is never left stuck in `RUNNING` when the
  adapter throws — verified by a test reproducing a genuine mid-dispatch
  throw, not just a "failed" result. `SessionRegistry` untouched. No HTTP
  routes yet (page12). 200 default-suite tests passing, lint/typecheck
  clean.
- Attempted to push page11 to `origin/main`: failed with the same 403
  credentials issue. Commit remains local.
- Implemented page12: full `/sessions*` REST surface (create/list/inspect,
  events, tasks, instructions, resume, stop, cancel). Found and fixed a
  real gap while wiring this page: `SessionRegistry.startSession`'s
  `initialInstruction` never went through `TaskRegistry`, so a session's
  very first instruction got no `Task` record. Fixed at the HTTP boundary
  (`POST /sessions` starts the session bare, then dispatches separately
  through `TaskRegistry` if an instruction was given) rather than changing
  either registry's already-tested contract. Added
  `TaskRegistry.cancelLatestTaskForSession` + `NoCancellableTaskError`.
  Extracted a shared `buildTestApp` fixture after the third HTTP test file
  needed the same setup. 216 default-suite tests passing, lint/typecheck
  clean, plus a real manual end-to-end run against the live controller.
- Attempted to push page12 to `origin/main`: failed with the same 403
  credentials issue. Commit remains local.
- Implemented page13: `attachWebSocketServer` shares the existing HTTP
  server (`/ws` path) and broadcasts every published `DomainEvent` to
  connected clients as `packages/protocol`'s already-defined `WsEnvelope`
  protocol. Per-connection subscribe/unsubscribe session filtering, and a
  ping/pong heartbeat (interval injectable for tests) that terminates dead
  connections. `lifecycle.ts` shutdown now explicitly terminates open WS
  connections before closing the WS and HTTP servers. No auth yet
  (page14). 225 default-suite tests passing (including real `node:http` +
  real `ws`-client integration tests), plus a real manual end-to-end run.
