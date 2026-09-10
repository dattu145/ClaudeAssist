# Page 21: 24/7 hardening & reliability pass (final Phase 1 page)

# Objective
Not a new feature page — a pass over everything built in pages 1-20,
closing the gaps the roadmap named up front: bounded memory checks, log
rotation wiring (deliberately deferred here since page3 —
`packages/logging/src/rotation.md`), the `TEST_PLAN.md` "Recovery" test
layer (named since page1 but never built as its own suite), and finalizing
Phase 1 docs.

# Acceptance-criteria note
The roadmap says docs get finalized "against the Phase 1 Acceptance
Criteria checklist in the original spec." That checklist was in the
original chat message that kicked this project off; it isn't persisted
verbatim anywhere in `.claude/`. Per the user's direction, this page
finalizes against what *is* persisted — `ARCHITECTURE.md`, `SECURITY.md`,
`RISKS.md`, `TEST_PLAN.md`'s stated scope and non-goals — as the practical
stand-in, called out explicitly rather than presented as the verbatim
original checklist.

# Findings (audit performed before writing the implementation plan below)

**Bounded memory**: audited every `Map`/`Set`/interval in
`apps/controller/src`.
- `ClaudeCodeAdapter`'s `sessions`/`projectPaths`/`listeners` Maps
  (page8) grow by one entry per session for the life of the daemon and
  are never evicted. Not a false alarm, but also not fixable by adding an
  eviction/LRU cache: a session in ANY status (including terminal
  `COMPLETED`/`FAILED`/`STOPPED`) is legitimately resumable later
  (`SESSION_STATUS_TRANSITIONS` in `packages/protocol` allows
  `COMPLETED -> WORKING`, `FAILED -> STARTING`, `STOPPED -> STARTING`),
  and there is no session-deletion endpoint anywhere in the REST API
  today — so there is no safe moment to evict an entry without risking a
  resumed session hitting `SessionNotFoundError` inside the adapter while
  `SessionRepository` (SQLite, the actual source of truth) still has it.
  For a single-user personal tool this is a working set that scales with
  how many sessions one person creates (realistically dozens to low
  hundreds over months), not an unbounded-per-request leak. Documented as
  an accepted, bounded-by-realistic-usage tradeoff in `RISKS.md` rather
  than "fixed" with a cache that would introduce a real correctness bug
  for a problem that doesn't exist at this tool's actual scale — revisit
  if a session-deletion/archive endpoint is ever added (that would be the
  natural, safe eviction trigger).
- WS server (`api/ws/server.ts`, page13): `clientState` is a `WeakMap`
  keyed by the `ws` socket — entries are reclaimed by GC once a socket
  closes and nothing else references it; no leak.
- `InProcessEventBus` (page10): subscribers are a `Set`, removed via the
  `unsubscribe` each caller receives; `wireEventPersistence` and
  `wireNotifications` each subscribe exactly once for the life of the
  process — no per-request growth.
- `DISCOVERY_POLL_INTERVAL_MS` (`packages/config`): defined but never
  read anywhere in `apps/controller/src` — a dead config value.
  Process discovery (page15/16) only ever runs once, at startup
  (`Reconciler.reconcile()`'s background cross-check); there is no
  periodic re-poll. This is a real, previously-undocumented gap (drift
  between the controller's persisted state and reality between restarts
  is never caught), not something this hardening pass fixes — adding a
  recurring poller is new functionality, not hardening of what exists,
  and the roadmap's page sequence is otherwise closed. Documented in
  `RISKS.md` as a known Phase 1 limitation with a recommendation for
  whoever picks up Phase 2.

**Log rotation**: `rotation.md` deferred the decision to this page.
Consistent with ADR-002/ADR-004's "zero external infra, single-user
local daemon" stance, and given `npm audit`'s already-untriaged
transitive-dependency count (`PROGRESS.md`), this page hand-rolls a
minimal size-based rotating file writer directly in `packages/logging`
— no new npm dependency — rather than adding a rotation library. Off by
default (current stdout-only behavior unchanged unless configured).

**Recovery test suite**: `TEST_PLAN.md` names this as its own layer
("kill the controller mid-task, restart, assert reconciliation produces
correct states... against a `FakeClaudeSessionAdapter` that simulates a
process having died") but no test exercises the *full* `startController`
stack across two instances sharing one on-disk database — `reconciler.
test.ts` only unit-tests the `Reconciler` class directly.
`lifecycle.test.ts` always starts one controller against a fresh temp
dir. This page adds the missing full-stack version.

# Design
1. **Log rotation** — `packages/logging/src/file-sink.ts`: a
   `createRotatingFileWriter(filePath, { maxBytes, maxFiles })` returning
   a `write(line)` function. On each write, appends a line, then checks
   file size; if over `maxBytes`, rotates synchronously (`file.log` ->
   `file.log.1` -> ... -> `file.log.{maxFiles}`, oldest dropped) before
   the next write. `createLogger`'s existing `write` override (already
   used by every test in this codebase) is composable, so writing to both
   stdout and the file sink when configured — console for interactive
   `npm run dev`, file for headless 24/7 running — needs no change to
   `logger.ts`'s API: the entrypoint just passes a `write` function that
   does both. `packages/config` gains `LOG_FILE` (optional, unset by
   default), `LOG_MAX_FILE_BYTES` (default 10 MiB), `LOG_MAX_FILES`
   (default 5). `index.ts` (the real entrypoint, where the root logger is
   actually constructed — not `lifecycle.ts`, which takes an
   already-built logger and is also used by tests with injected loggers)
   wires `LOG_FILE` into the root logger construction when set.
2. **Bounded memory** — no code change (see Findings above); `RISKS.md`
   gains two new rows (`ClaudeCodeAdapter` in-memory maps'
   scales-with-usage tradeoff; `DISCOVERY_POLL_INTERVAL_MS` dead config /
   no periodic re-poll).
3. **Recovery test suite** — `apps/controller/src/recovery.test.ts`: full
   `startController()` stack, file-backed temp `DATA_DIR` (not
   `:memory:`, so state survives across instances). Start controller A
   with `FakeClaudeSessionAdapter`, create a project and a session,
   directly `UPDATE sessions SET status = 'WORKING'` on the raw DB
   (simulating a session frozen mid-dispatch by a hard kill — no code
   path in this design can leave that state gracefully, so the test
   creates it directly, the same way a real crash would leave it on
   disk). Call `controller.stop()` (closes the DB/HTTP server; nothing
   about `stop()` finalizes session state — matches a real ungraceful
   exit). Start controller B against the same `DATA_DIR` with a *fresh*
   `FakeClaudeSessionAdapter` instance (zero memory of A's session, per
   page16's design). Assert reconciliation transitions the session to
   `DISCONNECTED` and that `GET /sessions/:id` reflects it — proof the
   documented recovery algorithm (`architecture/session-model.md`,
   page16) actually works end-to-end, not just at the unit level.
4. **Docs finalized**:
   - `RISKS.md`: the two new rows above.
   - `packages/logging/src/rotation.md`: replaced with the page21
     decision (what got built) instead of "deferred to page21."
   - `PROGRESS.md`: a Phase 1 close-out section checking the finalized
     state against `ARCHITECTURE.md`/`SECURITY.md`/`RISKS.md`/
     `TEST_PLAN.md` (see Acceptance-criteria note above) — what's done,
     what's explicitly deferred to Phase 2 (voice, Bordio, WhatsApp,
     multi-user, Postgres — per `ARCHITECTURE.md`'s non-goals), and the
     one open item outside my control (git push access).

# Implementation
1. `packages/logging/src/file-sink.ts` (+ test: rotation actually
   truncates/renames at the byte threshold, oldest file dropped at
   `maxFiles`).
2. `packages/logging/src/index.ts` — export `createRotatingFileWriter`.
3. `packages/config/src/schema.ts` — `LOG_FILE`/`LOG_MAX_FILE_BYTES`/
   `LOG_MAX_FILES`.
4. `apps/controller/src/index.ts` — wire `LOG_FILE` into the root logger
   when configured.
5. `apps/controller/src/recovery.test.ts` (new, per Design #3).
6. `.claude/RISKS.md`, `packages/logging/src/rotation.md`,
   `.claude/PROGRESS.md` updates per Design #4.

# Files Changed
New: `packages/logging/src/file-sink.ts` (+ test),
`apps/controller/src/recovery.test.ts`. Modified:
`packages/logging/src/index.ts`, `packages/config/src/
schema.ts` (+ its test), `apps/controller/src/index.ts`,
`.claude/RISKS.md`, `packages/logging/src/rotation.md`.

# Tests
New rotation test (`file-sink.test.ts`), new recovery test
(`recovery.test.ts`), `load.test.ts` gains cases for the new config
fields. `npm run typecheck`, `npm run lint`, `npm test` green from root.
Real end-to-end manual check: run the rotation writer past its byte
threshold against a real temp file on disk and confirm the actual files
on disk rotate as expected (not just asserted in-process) — same
"real, not mocked" verification bar as every prior page.

# Acceptance Criteria
- [x] Bounded-memory audit performed and documented (findings above); no
      speculative fix introduced where none is warranted.
- [x] Log rotation implemented, off by default, verified against real
      files on disk crossing the byte threshold.
- [x] A full-stack recovery test exists: two real `startController()`
      instances sharing one on-disk DB, proving the documented
      reconciliation algorithm end-to-end.
- [x] `RISKS.md` and `rotation.md` reflect the final, not deferred, state.
- [x] `PROGRESS.md` has a Phase 1 close-out section per the
      Acceptance-criteria note above.
- [x] All tests pass; typecheck and lint clean.

# Risks
- The `ClaudeCodeAdapter` in-memory-map growth is a deliberate
  "documented, not fixed" call (see Findings) — revisit if a
  session-deletion endpoint is ever added, or if real usage volume turns
  out far higher than the "dozens to low hundreds" assumption.
- Hand-rolled rotation (vs. a battle-tested library) trades some edge-case
  robustness (e.g., concurrent-process-safe rotation) for zero new
  dependencies — acceptable for a single-process, single-user daemon
  (ADR-002/ADR-004); would need revisiting if the controller ever runs as
  multiple processes against the same log file.

# Completion Checklist
- [x] All Acceptance Criteria checked
- [x] `.claude/CHANGELOG.md` entry added
- [x] `.claude/PROGRESS.md` updated (Phase 1 close-out)
- [x] Phase 1 complete — no page22; next work is Phase 2 (out of this
      roadmap's scope) or the still-open git push access item
