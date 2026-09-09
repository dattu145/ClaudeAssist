# Progress

**Current phase**: Phase 1
**Current page**: page12 (REST API completion) — not started
**Completed pages**: page1 (project foundation & monorepo skeleton), page2
  (packages/protocol & packages/config), page3 (packages/logging), page4
  (controller foundation), page5 (session state machine + domain entities),
  page6 (Project Registry), page7 (ClaudeSessionAdapter interface +
  FakeClaudeSessionAdapter), page8 (ClaudeCodeAdapter — real implementation),
  page9 (Session Registry), page10 (event system + EventRepository),
  page11 (Task system)
**Active work**: none
**Blocked work**: **git push access** — `dattu145/ClaudeAssist` push is
  failing with 403 (cached credentials are for a different GitHub account,
  `leadsprogress`, which lacks push access). Page10 and page11 commits are
  sitting locally on `main`, unpushed. User needs to fix credentials/repo
  access before the next push.
**Known issues**: `npm install` reports 17 pre-existing vulnerabilities in
  transitive deps (mostly from the Expo scaffold + better-sqlite3's build
  chain) — not yet triaged; do not run `npm audit fix --force` without
  review, it can silently change majors.
**Next action**: write `.claude/plans/page12.md`, then implement it
**Last completed milestone**: page11 implemented and verified (2026-09-09) —
  `Task` entity/state machine (`packages/protocol`'s `TASK_STATUS_TRANSITIONS`,
  with `RUNNING -> CANCELLED` deliberately unsupported — flagged as a real
  gap, not hidden), `TaskRepository`/`SqliteTaskRepository`, and
  `TaskRegistry` wrapping `SessionRegistry.sendInstruction` so every
  dispatched instruction produces a persisted, state-tracked `Task` —
  the spec's "what did I tell Project A to do?" requirement.
  `startedAt`/`completedAt` bookkeeping lives once in `transitionTask`, not
  duplicated by callers. `TaskRegistry` never leaves a task stuck in
  `RUNNING`: a thrown adapter error is caught, the task is marked `FAILED`,
  then the error is re-thrown — verified by a test that reproduces a
  mid-dispatch throw (not just a "failed" `InstructionResult`) via a second
  adapter instance sharing the same SQLite session record. `SessionRegistry`
  itself was not modified. No HTTP routes yet (page12). Verified:
  typecheck/lint clean, 200 default-suite tests passing across 39 files.
**Last completed milestone**: page10 implemented and verified (2026-09-09) —
  `InProcessEventBus` + `translateSessionEvent` (`SessionAdapterEvent` ->
  `DomainEvent`, with `status_changed` mapped to the more specific
  `SESSION_STARTED`/`SESSION_WAITING_FOR_INPUT`/
  `SESSION_WAITING_FOR_PERMISSION` types where derivable) +
  `SqliteEventRepository`, wired together via `wireEventPersistence`.
  `GET /sessions/:id/events` is live. `lifecycle.ts` now constructs and
  wires the real `ClaudeCodeAdapter` into the running controller for the
  first time (grep-verified). A real timing bug was found and fixed before
  it shipped: `SessionRegistry` (page9) subscribed to adapter events only
  *after* `adapter.startSession` resolved, but an initial-instruction
  dispatch fires its events *during* that same call — so the very first
  dispatch's events would have been silently dropped. Fixed by having
  `SessionRegistry` generate the session id upfront and subscribe before
  calling the adapter (`StartSessionInput` gained an optional `sessionId`;
  `createSession` gained an optional `id` override). Verified with a
  dedicated regression test and a real end-to-end manual run against the
  live controller confirming all 5 events from an initial dispatch
  (`SESSION_STARTED` through `SESSION_COMPLETED`) were captured. 173
  default-suite tests passing across 34 files; typecheck/lint clean.
**Last completed milestone**: page9 implemented and verified (2026-09-09) —
  `SessionRegistry` wraps a `ClaudeSessionAdapter` with SQLite persistence
  (`sessions` table, FK-blocks-delete against `projects` — deliberate,
  documented), status tracking, and event subscription, mirroring page6's
  entity/repository/registry pattern. `startSession` resolves and validates
  the project via `ProjectRegistry` (never orphans a session on an unknown
  project); `sendInstruction`/`resumeSession`/`stopSession` all delegate to
  the adapter then re-sync full state via a new `getSession` port method
  (added this page — `getStatus` alone wasn't enough for the registry to
  persist accurately; safe to amend, no other page depended on the old
  shape yet). A real integration test caught a genuine adapter bug before
  it shipped: `lastOutput`/`lastError`/`currentTask` were declared on the
  `ClaudeSession` schema since page2 but neither adapter ever actually
  populated them — only fired transient events. Fixed in both
  `FakeClaudeSessionAdapter` and `ClaudeCodeAdapter` so dispatch results are
  now genuinely persisted, not just observed live. Verified: typecheck/lint
  clean, 149 default-suite tests passing across 29 files, and the 2 opt-in
  real-CLI tests re-run and still passing against the live CLI after the
  adapter changes.
