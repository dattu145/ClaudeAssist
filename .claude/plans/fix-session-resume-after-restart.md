# Fix: a DISCONNECTED session cannot actually be resumed after a restart

Not a roadmap page (both Phase 1 and Phase 2 are closed) — a standalone
fix for a real gap found during pageB5's audit (`RISKS.md`), by the
user's request.

# Objective
`SESSION_STATUS_TRANSITIONS` (`packages/protocol`) documents
`DISCONNECTED -> STARTING` as valid — a disconnected session (page16:
what every mid-flight session becomes on restart) is meant to be
resumable. It currently isn't: `SessionRegistry.resumeSession`/
`sendInstruction`/`stopSession` call straight into
`ClaudeSessionAdapter`, whose in-memory record is only ever populated by
`startSession` — a fresh adapter instance (every restart, by design —
page16) has no record of a session created in a previous process, so
these calls throw `SessionNotFoundError` for exactly the sessions
reconciliation just marked `DISCONNECTED`.

# Root cause
`ClaudeCodeAdapter`/`FakeClaudeSessionAdapter` each keep a private
`Map<string, ClaudeSession>` as their source of truth for "sessions I
know about," populated only inside `startSession`. `SessionRegistry`'s
other mutating methods assume that map is already populated — true
within one process's lifetime, false after any restart. `SessionRepository`
(SQLite) has the persisted record the whole time; nothing currently
hands it back to a fresh adapter instance.

# Design
Add one new method to the `ClaudeSessionAdapter` port
(`domain/session/adapter.ts`):
```ts
/** Populates the adapter's in-memory record for a session from
 * persisted state, without any CLI/network I/O — the missing half of
 * "a fresh adapter instance has no memory of old sessions" (page16).
 * Idempotent: a no-op if the adapter already knows about this session. */
rehydrate(session: ClaudeSession, projectPath: string): Promise<void>;
```
Implemented identically in both `ClaudeCodeAdapter` and
`FakeClaudeSessionAdapter`: if not already present, `this.sessions.set`
+ `this.projectPaths.set` — literally what `startSession` already does,
minus dispatching anything. For the real adapter this is what makes a
resumed session's next dispatch correctly pass `--resume
<claudeSessionId>` (`ClaudeCodeAdapter.dispatch`) — `transitionSession`
already preserves `claudeSessionId` through every status transition
(`domain/session/entity.ts`), including reconciliation's
`DISCONNECTED` one, so the persisted row still has what's needed.

`SessionRegistry` gains a private helper, used by `resumeSession`,
`sendInstruction`, and `stopSession` in place of their current bare
`await this.getSession(sessionId)` existence check:
```ts
private async ensureAdapterKnowsSession(sessionId: string): Promise<ClaudeSession> {
  const persisted = await this.getSession(sessionId); // SessionNotFoundError if truly unknown
  try {
    await this.adapter.getSession(sessionId);
    return persisted; // already known to the adapter — nothing to do
  } catch (err) {
    if (!(err instanceof SessionNotFoundError)) throw err;
  }
  const project = await this.projectRegistry.getProject(persisted.projectId);
  await this.adapter.rehydrate(persisted, project.path);
  this.ensureSubscribed(sessionId, persisted.projectId);
  return persisted;
}
```
This closes the second, easy-to-miss half of the bug: `startSession`
also calls `this.adapter.subscribe(sessionId, handler)` so adapter
events get forwarded to the event bus — a rehydrated session needs the
exact same subscription, or a resumed session's output/status-change
events would silently never reach `EventRepository`/WS/notifications.
Extracted into `ensureSubscribed(sessionId, projectId)`, called from
both `startSession` and `ensureAdapterKnowsSession`, guarded by a
`Set<string>` of already-subscribed session ids so a session already
subscribed in this process (the common case — nothing changes for a
session that was `startSession`'d in this same process) is never
double-subscribed, which `subscribe`'s current no-dedupe semantics would
otherwise turn into duplicate event delivery.

# Implementation
1. `domain/session/adapter.ts` — add `rehydrate` to the interface.
2. `adapters/claude-code/claude-code-adapter.ts`,
   `adapters/fake/fake-claude-session-adapter.ts` — implement it.
3. `domain/session/registry.ts` — `ensureAdapterKnowsSession` +
   `ensureSubscribed`, wired into `resumeSession`/`sendInstruction`/
   `stopSession`/`startSession`.
4. Real end-to-end proof: extend `apps/controller/src/recovery.test.ts`
   (page21's two-instance pattern already exists there) with a case that
   doesn't just assert `DISCONNECTED`, but goes one step further — calls
   `POST /sessions/:id/resume` on the *second* instance and asserts it
   actually succeeds (`WORKING`, not a 500/`SessionNotFoundError`), then
   sends a real instruction and confirms it completes normally.

# Files Changed
Modified: `apps/controller/src/domain/session/adapter.ts`,
`apps/controller/src/adapters/claude-code/claude-code-adapter.ts`,
`apps/controller/src/adapters/fake/fake-claude-session-adapter.ts`,
`apps/controller/src/domain/session/registry.ts` (+ its test),
`apps/controller/src/recovery.test.ts`.

# Tests
`registry.test.ts` gains cases: a mutating call for a session the
adapter doesn't yet know about triggers `rehydrate` + subscribes exactly
once; a second mutating call for the same session doesn't re-subscribe
(no duplicate event delivery — verified by counting handler
invocations); `rehydrate` is a no-op when the adapter already knows the
session. `recovery.test.ts` gains the real cross-restart resume case
above. `claude-code-adapter.test.ts` and `fake-claude-session-adapter.test.ts`
each gain a `rehydrate` case (idempotent, and a subsequent dispatch uses
the rehydrated `claudeSessionId` for `--resume`). `npm run typecheck`,
`npm run lint`, `npm test` green from root.

# Acceptance Criteria
- [x] A session reconciliation marks `DISCONNECTED` can be resumed via
      `POST /sessions/:id/resume` on a *different* controller instance
      (real process boundary, not just a unit test of the transition
      table) — verified in `recovery.test.ts`.
- [x] A resumed session's subsequent events (output, status changes)
      are correctly forwarded to the event bus — not silently dropped
      because the adapter subscription was never re-established.
- [x] No duplicate event delivery for a session that was already known
      to the adapter (the common, non-restart case) — `ensureSubscribed`
      never subscribes twice.
- [x] The real adapter's rehydrated `claudeSessionId` is actually used
      on the next dispatch (`--resume <id>`), not silently dropped.
- [x] All tests pass; typecheck and lint clean.

# Risks
- `SessionRegistry`'s new `subscribedSessionIds: Set<string>` grows by
  one entry per session touched in this process's lifetime, never
  evicted — same accepted tradeoff `RISKS.md` already documents for
  `ClaudeCodeAdapter`'s maps (bounded by realistic single-user session
  volume, not a per-request leak); noted here rather than treated as a
  new, separate risk.
- This does not change reconciliation's own decision of what counts as
  stale-on-restart, nor add any new automatic resume — a session stays
  `DISCONNECTED` until a user explicitly resumes it, same as today; this
  fix only makes that explicit resume actually work.

# Completion Checklist
- [x] All Acceptance Criteria checked
- [x] `.claude/CHANGELOG.md` entry added
- [x] `.claude/PROGRESS.md` updated
- [x] `.claude/RISKS.md`'s resume-after-restart row updated from "found,
      not fixed" to "fixed"
