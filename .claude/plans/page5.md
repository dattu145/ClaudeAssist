# Page 5: Session State Machine + Domain Entities

# Objective
Turn `packages/protocol`'s `SESSION_STATUS_TRANSITIONS` (data) into enforced
domain behavior: a pure state-machine function that rejects and logs invalid
transitions, plus a `ClaudeSession` domain entity factory/transition helper
that `apps/controller`'s Session Registry (page9) will build on. Small
shared `id`/`time` utilities land in `packages/shared` since entity creation
needs them and every later registry (page6, page9, page11) will too.

# Why
ARCHITECTURE.md and architecture/session-model.md require: "Invalid state
transitions must be rejected and logged" as a hard rule, not a convention
scattered across call sites. Centralizing it now, before page9's Session
Registry exists, means the registry can't accidentally bypass the rule —
there's only one code path that changes a session's status.

# Prerequisites
Page2 (`SESSION_STATUS_TRANSITIONS`/`isValidSessionTransition` in
`packages/protocol`), page3 (`packages/logging`), page4 (controller
foundation, for where domain code will eventually plug into repositories)
all done.

# Implementation
1. `packages/shared/src/id.ts` — `generateId(prefix: string)` (e.g.
   `generateId("session")` -> `"session_<uuid>"`), used for every domain
   entity id from here on so ids stay stable-format
   (`project_123`-style, matching the spec's examples) rather than bare
   UUIDs.
2. `packages/shared/src/time.ts` — `nowIso()` (single choke point for "what
   time is it", in UTC ISO-8601, so tests can inject/mock it later if
   needed rather than every call site calling `new Date().toISOString()`
   directly).
3. `apps/controller/src/domain/session/state-machine.ts` —
   `applyTransition(current: SessionStatus, target: SessionStatus, logger:
   Logger): SessionStatus` — pure function: if `isValidSessionTransition`
   (from `packages/protocol`) says yes, returns `target`; if no, logs a
   structured warning (`event: "invalid_session_transition"`, `context:
   { from, to }`) via the passed logger and returns `current` unchanged
   (transition is a no-op, never throws — a caller decides whether a no-op
   is itself an error).
4. `apps/controller/src/domain/session/entity.ts` —
   `createSession(input: { projectId: string; claudeSessionId?: string |
   null }): ClaudeSession` (status `DISCOVERED`, all optional fields null,
   timestamps via `nowIso()`, id via `generateId("session")`) and
   `transitionSession(session: ClaudeSession, target: SessionStatus, logger:
   Logger): ClaudeSession` — calls `applyTransition`, and if the status
   actually changed, returns a new session object with `status` and
   `lastActivityAt` updated (immutable — never mutates the input) and emits
   nothing yet (event emission is page10; this function is pure domain
   logic only).
5. Both entity functions validate their output against
   `ClaudeSessionSchema.parse` before returning — catches a domain bug
   (e.g. a missing field) immediately rather than letting a malformed
   session leak into the registry/DB layers built in page9+.
6. Tests (the TEST_PLAN.md "state-machine" layer):
   - exhaustive transition table test (already partly covered in
     `packages/protocol`'s own tests — this page's tests focus on the
     *behavior* wrapper: does an invalid transition log and no-op, does a
     valid one apply and bump `lastActivityAt`).
   - `createSession` produces a schema-valid, `DISCOVERED` session.
   - `transitionSession` on a valid transition updates status + timestamp
     and preserves all other fields (immutability check: original object
     is untouched).
   - `transitionSession` on an invalid transition returns an
     object `===`-equal in content to the original (no status change) and
     the injected logger's `.warn` was called with the expected context.

# Files Changed
New: `packages/shared/src/id.ts`, `packages/shared/src/time.ts`,
`apps/controller/src/domain/session/{state-machine.ts, entity.ts}` +
`.test.ts` files for each. Modified: `packages/shared/src/index.ts`
(re-export), `apps/controller/tsconfig.json` if new refs needed (none — no
new workspace deps).

# Tests
Per above; `npm run typecheck`, `npm run lint`, `npm test` green from root.

# Acceptance Criteria
- [ ] No code path outside `domain/session/state-machine.ts` decides whether
      a session transition is valid.
- [ ] Invalid transitions are logged (structured, via the injected `Logger`)
      and never silently applied.
- [ ] `createSession`/`transitionSession` never produce a
      `ClaudeSessionSchema`-invalid object (enforced by `.parse` inside
      them, not just by convention).
- [ ] `transitionSession` is immutable (verified by test, not just by
      review).
- [ ] All tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- Scope discipline: this page is session domain logic only — no Project/Task
  domain entities yet (those aren't needed until page6/page11 respectively,
  and building them speculatively now risks guessing at shapes those pages
  will actually need).
- `generateId`/`nowIso` in `packages/shared` are trivial today but become
  load-bearing everywhere — keep them dependency-free and side-effect-free
  so they're trivially testable and never a source of flakiness.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page6.md` written (Project Registry) before starting page6
