# Session Model

## Entity hierarchy

```
Project
  └── Terminal (best-effort; see Terminal Discovery Limitation below)
       └── Process (OS process, via ProcessDiscoveryService)
            └── ClaudeSession (ClaudeOps domain entity)
```

`ClaudeSession` is the primary entity the rest of the system reasons about.
`Terminal` and `Process` are supporting metadata populated on a best-effort
basis — the system must function correctly even when they are `null`/unknown.

## Terminal discovery limitation

There is no reliable, cross-platform, general API to enumerate "terminal
sessions" and map them to child processes without OS-specific, fragile
techniques (e.g. parsing `conhost`/Windows Terminal internals, or tty
enumeration on POSIX). Phase 1 implements `ProcessDiscoveryService` (page15;
OS process list + best-effort parent/child linkage, Windows implementation
verified, POSIX unverified on this dev environment) and treats `Terminal` as
an optional, best-effort field, left `null` for Phase 1 — under the real
adapter design (page8: every managed session is a short-lived process per
dispatch, no persistent `--bg` process to correlate against a terminal), there
is no reliable per-session terminal to populate even for controller-started
sessions. We do not attempt to discover terminals for processes the
controller did not itself start. This is a documented limitation, not a gap
to be closed with a workaround.

## Session state machine

States: `DISCOVERED, STARTING, IDLE, WORKING, WAITING_FOR_INPUT,
WAITING_FOR_PERMISSION, COMPLETED, FAILED, STOPPED, DISCONNECTED, UNKNOWN`.

Allowed transitions (enforced by `packages/shared` state machine util; anything
not listed is rejected and logged as an invalid-transition warning):

```
DISCOVERED        -> STARTING, UNKNOWN, DISCONNECTED
STARTING          -> IDLE, WORKING, FAILED, DISCONNECTED
IDLE              -> WORKING, STOPPED, DISCONNECTED, UNKNOWN
WORKING           -> WAITING_FOR_INPUT, WAITING_FOR_PERMISSION, COMPLETED, FAILED, STOPPED, DISCONNECTED
WAITING_FOR_INPUT -> WORKING, STOPPED, DISCONNECTED
WAITING_FOR_PERMISSION -> WORKING, STOPPED, DISCONNECTED
COMPLETED         -> WORKING (new instruction dispatched to a completed/resumable session), DISCONNECTED
FAILED            -> STARTING (retry/resume), DISCONNECTED
STOPPED           -> STARTING (resume), DISCONNECTED
DISCONNECTED      -> UNKNOWN, STARTING (reconciliation on controller restart)
UNKNOWN           -> any (recovered by reconciliation once real status is known)
```

Every transition emits `SESSION_STATUS_CHANGED { previous, current }`.

## Reconciliation on controller startup (page16, corrected post-page8)

This section originally (page1) assumed sessions map to potentially
long-lived OS processes cross-referenced against `claude agents --json` on
every restart. **Page8's real adapter testing proved that's not how the
system actually works**: every managed session is a plain resumable
conversation with no persistent process between dispatches (no `--bg`). A
fresh `ClaudeCodeAdapter` instance starts with a completely empty in-memory
session map on every controller restart — it has no way to "still know
about" a previously-tracked session regardless of whether any process
happens to be running. The corrected algorithm (`domain/reconciliation/
reconciler.ts`):

1. **Disconnect stale mid-flight sessions, unconditionally.** Any persisted
   session whose status is `STARTING`, `WORKING`, `WAITING_FOR_INPUT`, or
   `WAITING_FOR_PERMISSION` is, by construction, now stale — transition it to
   `DISCONNECTED` without checking `claude agents --json` first (it would
   almost certainly report nothing for our own managed sessions anyway).
   Sessions already in a terminal-ish status (`COMPLETED`, `FAILED`,
   `STOPPED`, `DISCONNECTED`, `UNKNOWN`) are left untouched — their absence
   from any live process list is expected, not a problem.
2. **Discover unmanaged sessions.** `claude agents --json --all`
   (`ClaudeSessionAdapter.discoverSessions()`) is still genuinely useful for
   finding sessions the controller did *not* start — interactive terminals
   opened by hand, or a stray `--bg` job. Any reported process whose
   `claudeSessionId` isn't already persisted gets matched to a registered
   `Project` by `cwd` (exact path match, separator/case-normalized) and
   recorded as a new `DISCOVERED`-status session — informational only; per
   ADR-003 we still can't dispatch to it, only observe it. No matching
   project: logged and skipped (a session requires a `projectId`; we don't
   guess one).
3. **`ProcessDiscoveryService` is a diagnostic cross-check only** (per
   page15): if it finds `claude` OS processes `agents --json` didn't report,
   that's logged as a warning, never used to drive session state — it lacks
   the session-id/cwd correlation `agents --json` provides.
4. Every state change publishes a `DomainEvent` (`SESSION_DISCONNECTED`/
   `SESSION_DISCOVERED`, `source: "system"`) through the `EventBus`, visible
   in the event log and over WS like any other change.

Reconciliation runs once, at startup, before the HTTP/WS servers begin
accepting traffic (`lifecycle.ts`) — never as a background poll.
