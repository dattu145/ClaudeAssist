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
- Attempted to push page13 to `origin/main`: failed with the same 403
  credentials issue. Commit remains local.
- Implemented page14: pairing code issuance (fresh 8-char code every
  startup, logged, 10-min TTL, single-use, invalidates prior-run codes) +
  `POST /pairing/exchange` (public) + `POST /pairing/revoke`
  (authenticated) + `createAuthMiddleware` gating every route except
  `GET /health` and `/pairing/*`. Tokens stored SHA-256-hashed at rest,
  never plaintext. Wired up `packages/config`'s previously-unused
  `PAIRING_TOKEN_TTL`. `startController` became `async`. Every existing
  HTTP route test now authenticates. 264 default-suite tests passing,
  lint/typecheck clean, plus a real manual end-to-end run of the full
  pairing/revoke flow against the live controller.
- Attempted to push page14 to `origin/main`: still 403. Confirmed the
  issue is the stored HTTPS credential, not `git config user.name` (which
  the user changed to `riteshvividview` — push still fails as
  `leadsprogress`). Commit remains local.
- Implemented page15: `ProcessDiscoveryService`
  (`listProcesses`/`findClaudeProcesses`), the spec's OS-level process
  abstraction, distinct from `ClaudeCodeAdapter.discoverSessions()`
  (Claude Code's own self-reported list). Windows implementation
  (`Get-CimInstance Win32_Process` via PowerShell, Zod-validated) verified
  for real against this machine — found 367 processes including 2 genuine
  `claude.exe`. POSIX implementation built for portability but honestly
  documented as unverified (this dev environment is Windows), flagged in
  RISKS.md. Not wired into `lifecycle.ts` yet — page16 is the consumer.
  281 default-suite tests passing, lint/typecheck clean, grep-confirmed no
  platform-specific command leaks outside `adapters/process-discovery/`.
- Attempted to push page15 to `origin/main`: still 403 (same stored-
  credential issue). Commit remains local.
- Implemented page16: startup reconciliation
  (`domain/reconciliation/reconciler.ts`). Corrected
  `architecture/session-model.md`'s reconciliation algorithm to match
  reality: page8 proved sessions don't map to long-lived processes, so any
  persisted session in a mid-flight status is unconditionally disconnected
  on startup rather than conditionally cross-referenced against `claude
  agents --json`; that CLI call is still used, but for discovering
  *unmanaged* sessions (matched to a project by `cwd`) as `DISCOVERED`
  records. `GET /health`'s `lastReconciliationAt` finally reflects a real
  value via a getter instead of a permanently-`null` static field.
  Found and fixed two real problems via testing: a redundant double call
  to `discoverSessions()`, and — far more significantly — a measured ~7s
  of pure `powershell.exe` process-startup overhead on this machine that
  was blocking every controller startup through the (diagnostic-only,
  state-non-driving) `ProcessDiscoveryService` cross-check. Decoupled it
  into a background task; `startController()` now resolves in ~2.5s
  instead of ~19-22s (measured). Made `startController`'s real
  dependencies injectable so `lifecycle.test.ts` runs in <3s instead of
  96s (and sometimes timing out) without losing real-integration coverage,
  reverified via a fresh manual end-to-end run. 298 default-suite tests
  passing, lint/typecheck clean.
- Attempted to push page16 to `origin/main`: still 403 (same stored-
  credential issue). Commit remains local.
- Implemented page17: mobile foundation. `expo-router` file-based
  navigation, a pairing screen (the only thing an unpaired device can
  reach), `expo-secure-store`-backed token/URL storage, and a
  `ConnectionBadge` connection-state indicator polling `GET /health` on a
  bounded, unmount-cleared interval. `ConnectionProvider` gates the app:
  unpaired shows only `pairing.tsx`, paired reveals the `(tabs)` group
  (Dashboard/Projects/Sessions/Settings placeholders — real data is
  page18). Pairing calls the real `POST /pairing/exchange` using
  `@claudeops/protocol`'s schemas directly. Found and fixed a real
  monorepo dependency-hoisting bug installing `expo-router`: a transitive
  dep pulled `react@19.3.0` at the workspace root while `apps/mobile`
  needed the SDK-pinned `19.2.3` — two copies installed, caught by
  `expo-doctor`'s duplicate-dependency check. Fixed with a root `package.
  json` `overrides` pin, confirmed via a full clean reinstall. Verified:
  `expo-doctor` 21/21, `tsc --noEmit` clean, root typecheck/lint/test still
  green after the reinstall (298 tests), Metro bundler boots cleanly. No
  device/simulator testing possible in this environment (documented, same
  as page1).
- Implemented page18: mobile dashboard + real data. While wiring the
  mobile app as the first real WS consumer, found that
  `attachWebSocketServer` (page13) attaches directly to the raw
  `http.Server`'s `upgrade` event, bypassing Express entirely — page14's
  `createAuthMiddleware` never ran for WS connections, so any device on
  the LAN could connect to `/ws` unauthenticated. Fixed before building on
  it: `attachWebSocketServer` gained a `pairingRegistry` param and a `ws`
  `verifyClient` gate requiring `/ws?token=<token>` (query param, since
  React Native's `WebSocket` can't send custom connect headers), validated
  via `PairingRegistry.verifyToken`; invalid/missing tokens now get the
  upgrade rejected (401) before a socket ever opens. `server.test.ts`
  gained real `ws`-client tests for missing/invalid/valid tokens against a
  real in-memory-SQLite `PairingRegistry`. Built `lib/api-client.ts` (typed
  REST client validating every request/response against
  `@claudeops/protocol` schemas), `lib/use-live-events.ts` (WS hook,
  exponential-backoff reconnect, bounded 100-event buffer, optional
  per-session subscribe), and six screens: Dashboard (real summary counts
  + live activity feed), Projects (list/create), Sessions (list/start),
  project detail, session detail (status, live output, resume/stop/
  cancel/send-instruction, task history, live events). Root layout now
  pushes `project/[id]`, `project/new`, `session/[id]`, `session/new` as
  headered stack screens over the tab group. Verified: root typecheck/
  lint/test green (301 tests, +9 WS tests incl. 3 new token-gate cases),
  mobile `tsc --noEmit` clean, `expo-doctor` 21/21, a real Metro/Hermes
  bundle export (1137 modules, no errors), and a real end-to-end manual
  check (`tsx` against a live `startController()`, not mocked) covering
  the full mobile-client path: capture the real startup pairing code,
  exchange it, confirm `/ws` rejects no/bad tokens and accepts a valid
  one, create a project, start a session with an initial instruction,
  confirm the WS client receives the live envelope for it, confirm
  unauthenticated `/projects` is rejected. No device/simulator testing
  possible in this environment (documented, same as page1/page17).
- Implemented page19: NotificationService (Console) + domain-event wiring
  — the third `EventBus` subscriber named in `architecture/event-
  system.md` (alongside `EventRepository` and the WS API), a documented
  gap since page10. Added `domain/notification/service.ts` (the
  `NotificationService` interface, drawn now per ADR-002 so a future
  push/WhatsApp/voice notifier is a new adapter, not a rewrite),
  `domain/notification/should-notify.ts` (pure classifier: `SESSION_
  COMPLETED`/`FAILED`/`WAITING_FOR_INPUT`/`WAITING_FOR_PERMISSION`/`ERROR`
  are notify-worthy — the first four are event-system.md's own examples,
  `SESSION_ERROR` added as the same bucket as `FAILED` — everything else
  is informational and already reaches mobile live over WS),
  `adapters/notification/console-notification-service.ts` (Phase 1's
  implementation, logs through the existing structured JSON stdout tagged
  `notification: true`), and `domain/notification/wire-notifications.ts`
  (bus subscriber, same fire-and-forget-with-logged-failure shape as
  `wireEventPersistence`). Wired live in `lifecycle.ts`. 322 tests passing
  (+21 new), typecheck/lint clean. Verified end-to-end with a real
  `startController()` run (not mocked): drove one `FakeClaudeSession
  Adapter` session to `SESSION_COMPLETED` and a second (via
  `queueInstructionOutcome`) to `SESSION_FAILED`, confirmed a real
  `notification: true` log line fired for each and that `SESSION_OUTPUT`
  produced none.
- Implemented page20: CommandRouter/IntentResolver interfaces — the typed
  command surface ADR-005 requires. `domain/command/types.ts` defines the
  `Command` discriminated union (`SEND_INSTRUCTION`, `RESUME_SESSION`,
  `STOP_SESSION`, `CANCEL_TASK` — the mutating session-level operations
  ADR-005 names as the cross-source surface; `StartSession`/
  `CreateProject` deliberately left as direct REST calls, a documented
  scope decision). `domain/command/router.ts`'s `CommandRouter.dispatch()`
  is a typed routing layer over the already-tested registry methods, no
  new business logic. `domain/command/intent-resolver.ts` defines
  `IntentResolver` as an interface only, per ADR-005's explicit "no
  LLM-backed implementation ships in Phase 1". Landed under
  `domain/command/`, matching the precedent reconciliation already set of
  landing under `domain/` rather than `ARCHITECTURE.md`'s sketched
  `orchestration/` tree. Actually wired in: `api/http/sessions.ts`'s four
  mutating routes now build a `Command` and call
  `commandRouter.dispatch()` instead of calling the registries directly —
  proving the abstraction against today's only real command source
  (mobile via REST) before voice ever needs it. 326 tests passing (+4
  new), and all 15 pre-existing `sessions.test.ts` cases for these routes
  passed unchanged — proof the reroute didn't shift behavior.
  Typecheck/lint clean. Verified end-to-end with a real `startController()`
  run (not mocked): drove a real session through all four `CommandRouter`
  paths over actual HTTP (send instruction, resume, stop, cancel task).
- Implemented page21: 24/7 hardening & reliability pass — the final
  Phase 1 page. Audited every `Map`/`Set`/interval in `apps/controller/
  src` for unbounded growth: found `ClaudeCodeAdapter`'s in-memory
  session maps grow for the daemon's life with no safe eviction point
  (no session-deletion endpoint exists, and every status is legitimately
  resumable — documented as an accepted, usage-bounded tradeoff in
  `RISKS.md` rather than "fixed" with a cache that would introduce a real
  `SessionNotFoundError` bug), and that `DISCOVERY_POLL_INTERVAL_MS` is
  defined but never wired to anything (no periodic re-discovery, only
  startup-time reconciliation) — both documented in `RISKS.md`, not
  silently left unexplained. Implemented log rotation
  (`packages/logging/src/file-sink.ts`'s `createRotatingFileWriter` — a
  minimal, dependency-free, size-based rotator, consistent with ADR-002/
  ADR-004's zero-external-infra stance rather than adding a new npm
  dependency), wired via new optional `LOG_FILE`/`LOG_MAX_FILE_BYTES`/
  `LOG_MAX_FILES` config into `apps/controller/src/index.ts` (off by
  default — unchanged stdout-only behavior otherwise). Added
  `apps/controller/src/recovery.test.ts`, closing the `TEST_PLAN.md`
  "Recovery" test layer gap that had existed since page1: two real
  `startController()` instances sharing one on-disk database, the first
  simulating a crash (a session left mid-flight on disk, no graceful
  finalization), the second a genuinely fresh process — proving the
  documented reconciliation algorithm end-to-end, not just at the
  `Reconciler`-unit level `reconciler.test.ts` already covered. Finalized
  `RISKS.md`, `packages/logging/src/rotation.md`, and added a Phase 1
  close-out section to `PROGRESS.md`, checked against `ARCHITECTURE.md`/
  `SECURITY.md`/`RISKS.md`/`TEST_PLAN.md` as the practical stand-in for
  the original spec's Phase 1 Acceptance Criteria checklist (not
  persisted verbatim anywhere in this repo — confirmed with the user
  before finalizing this way). 335 tests passing, typecheck/lint clean.
  Verified end-to-end: a real `startController()` instance writing to a
  real file on real disk with a small byte threshold, generating traffic
  via real HTTP requests, confirmed to actually rotate on disk — not just
  asserted in-process. **Phase 1 is complete.**
- Scoped Phase 2 (Bordio integration, user's choice among Bordio/
  WhatsApp/multi-user/voice): researched Bordio's actual REST API against
  their own docs (docs.bordio.com) — bearer-key auth, 120 GET/60 write
  per-minute rate limits (per key), idempotency keys on POST, ETag
  conditional GETs, and no webhooks yet ("a placeholder for an upcoming
  feature" per Bordio's own docs, ruling out an event-driven inbound
  integration). Wrote `research/bordio.md`, `decisions/ADR-006.md`
  (outbound via the existing `NotificationService` interface is primary;
  inbound is a bounded poller through the existing `CommandRouter`, not
  `IntentResolver`, since Bordio tasks are structured data not free
  text), and a proposed Phase 2 page sequence (pageB1-B5) in
  `MASTER_PLAN.md` — no implementation, awaiting approval per the same
  discipline Phase 1 used.
- Implemented pageB1 (approved, first Phase 2 page): `BordioClient`
  adapter + `FakeBordioClient`, fake-before-real (page7/page8's
  precedent). `domain/bordio/client.ts` is the port; `adapters/bordio/
  fake-bordio-client.ts` enforces the same idempotency-key replay/conflict
  semantics real Bordio documents; `adapters/bordio/bordio-client.ts`
  (`BordioApiClient`) is the real client — retries 429 (honoring
  `Retry-After`) and 500 with bounded backoff, never retries other 4xx,
  warns (never throws) on low `RateLimit-Remaining`, never logs the API
  key. An opt-in `bordio-client.real.test.ts` mirrors
  `claude-code-adapter.real.test.ts`'s pattern — written but not run (no
  real Bordio credentials available), same documented limitation the
  real-CLI suite has always had. Standalone, not wired into
  `lifecycle.ts` yet (pageB3's job). 358 tests passing (+25 new),
  typecheck/lint clean.
