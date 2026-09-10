# Page 16: Startup Reconciliation

# Objective
Implement the reconciliation algorithm from architecture/session-model.md —
correcting persisted session state on controller startup so it never lies
about what's actually happening — and wire real `lastReconciliationAt`
into `/health` (a field that has existed since page4 but was always `null`).

# The algorithm had to be corrected, not just implemented
architecture/session-model.md's reconciliation section (written page1,
before page8's real adapter testing) assumed sessions map to
potentially-long-lived OS processes it can cross-reference against
`claude agents --json`. Page8 proved that's not how our adapter actually
works: every managed session is a plain resumable conversation with **no
persistent process between dispatches** (no `--bg`). A fresh
`ClaudeCodeAdapter` instance starts with a completely empty in-memory
session map on every restart — it has no way to "still know about" a
session that survives process restart, regardless of whether any process
happens to be running.

The practical consequence: checking `claude agents --json` for a
persisted session's continued existence is close to useless for **managed**
sessions (they essentially never have a live process except mid-dispatch,
and a controller restart can't happen mid-dispatch from the new process's
perspective — it starts fresh). What actually needs to happen on startup:

1. **Any persisted session whose status implies it's mid-flight
   (`STARTING`, `WORKING`, `WAITING_FOR_INPUT`, `WAITING_FOR_PERMISSION`)
   is unconditionally stale** — the adapter instance that was tracking it
   is gone. Transition these to `DISCONNECTED` unconditionally, not
   conditionally on a `claude agents --json` lookup (the original
   algorithm's cross-reference step doesn't apply the way it was
   envisioned). Sessions already in a terminal-ish status (`COMPLETED`,
   `FAILED`, `STOPPED`, `DISCONNECTED`, `UNKNOWN`) are left alone.
2. **`claude agents --json --all` is still genuinely useful — for
   discovering *unmanaged* sessions** (interactive terminals the user
   started by hand, or a stray `--bg` job): any reported process whose
   `claudeSessionId` isn't already a known persisted session gets matched
   to a registered `Project` by `cwd` (exact path match, case/separator-
   normalized for Windows) and recorded as a new `DISCOVERED`-status
   session — informational, per ADR-003 we still can't dispatch to it, only
   observe it. A process with no matching project is logged and skipped
   (a `Task`/`ClaudeSession` requires a `projectId`; we don't guess one).
3. **`ProcessDiscoveryService` (page15) is a diagnostic cross-check only**,
   exactly as page15 described it: if it finds `claude` OS processes the
   CLI's own `agents --json` didn't report, that's logged as a warning
   (something worth a human's attention) but never drives state — it lacks
   the session-id/cwd correlation `agents --json` provides.
4. Every state change publishes a `DomainEvent` (`SESSION_DISCONNECTED`/
   `SESSION_DISCOVERED`, `source: "system"`) through the existing
   `EventBus`, so reconciliation is visible in the event log and over WS
   like any other state change.

`architecture/session-model.md` is updated to describe this corrected
algorithm — the doc must reflect what's actually built, not what page1
guessed before the real adapter existed.

# Implementation
1. `domain/reconciliation/paths.ts` — `isSamePath(a, b)`: normalizes
   separators and case (Windows paths are case-insensitive) before
   comparing.
2. `domain/reconciliation/reconciler.ts` — `Reconciler(sessionRepository,
   projectRepository, adapter, processDiscovery, eventBus, logger)`:
   `reconcile(): Promise<ReconciliationSummary>` running steps 1-3 above,
   returning counts for startup logging.
3. `health.ts` — `HealthDeps.lastReconciliationAt` becomes
   `getLastReconciliationAt?: () => string | null` (a getter, not a static
   value) — the old static field couldn't reflect a reconciliation that
   happens after `deps` is constructed but before/while the server is
   already serving `/health` requests.
4. `lifecycle.ts` — runs `await reconciler.reconcile()` **before**
   `app.listen(...)` (architecture/controller.md: "Startup reconciliation
   runs before the HTTP/WS servers start accepting traffic"), tracks the
   completion timestamp in a closure variable, passes
   `getLastReconciliationAt` into `createApp`.

# Files Changed
New: `domain/reconciliation/{paths,reconciler}.ts` (+ tests). Modified:
`health.ts` (+ its test), `lifecycle.ts`, `architecture/session-model.md`.

# Tests
`isSamePath` (case/separator normalization). `Reconciler.reconcile()`
against `FakeClaudeSessionAdapter` + real SQLite repositories: a `WORKING`
session with no adapter knowledge becomes `DISCONNECTED` and publishes the
event; a `STOPPED`/`COMPLETED` session is left untouched; a process
reported by the adapter but unknown to the repository, whose `cwd` matches
a registered project, becomes a new `DISCOVERED` session; the same with no
matching project is skipped (counted, not created); the
`ProcessDiscoveryService` cross-check logs a warning for an unaccounted
process without altering any session. `health.ts`'s getter-based
`lastReconciliationAt` reflects a value set after `getHealth`'s deps were
constructed. `npm run typecheck`, `npm run lint`, `npm test` green from
root.

# Acceptance Criteria
- [ ] No mid-flight-status session ever survives a restart still claiming
      to be `WORKING`/`STARTING`/`WAITING_FOR_*` — verified by test against
      a real SQLite-persisted fixture, not just in-memory.
- [ ] Reconciliation runs before the HTTP server accepts traffic — verified
      by ordering in `lifecycle.ts`, not just documented.
- [ ] `GET /health`'s `lastReconciliationAt` reflects the real completion
      time after a restart, not a permanently-`null` placeholder.
- [ ] `architecture/session-model.md` matches the actually-implemented
      algorithm, including the documented divergence from the original
      page1 draft.
- [ ] All tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- Path matching for unmanaged-session discovery is exact-match only (no
  fuzzy/subpath matching) — a project registered with a trailing slash or
  different casing than the CLI reports could fail to match. Acceptable
  for Phase 1; revisit only if it proves to be a real problem.
- `ProcessDiscoveryService`'s POSIX implementation is still unverified
  (page15) — the diagnostic cross-check inherits that limitation on
  non-Windows hosts.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page17.md` written (mobile foundation) before starting
      page17
