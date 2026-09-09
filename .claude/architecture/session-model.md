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
enumeration on POSIX). Phase 1 implements `ProcessDiscoveryService` (OS process
list + best-effort parent/child linkage) and treats `Terminal` as an optional,
best-effort field populated only where the underlying OS makes it cheap and
reliable (e.g. matching a `--bg` session's spawned process to its PID, which
the controller already knows because it did the spawning). We do not attempt to
discover terminals for processes the controller did not itself start. This is
a documented limitation, not a gap to be closed with a workaround.

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

## Reconciliation on controller startup

1. Load persisted sessions from `SessionRepository`.
2. Call `claude agents --json --all` (see research/claude-code.md) to get
   ground truth on what's actually running.
3. Cross-reference by `claudeSessionId`/PID. Sessions present in both: update
   status from live data. Sessions persisted but no longer reported: transition
   to `DISCONNECTED` (never silently assume still-active). Sessions reported by
   `claude agents` but unknown to the registry: create as `DISCOVERED`.
4. Emit `SESSION_RECONCILED`-class events for every change (mapped onto the
   existing event types, e.g. `SESSION_STATUS_CHANGED`, `SESSION_DISCOVERED`).
