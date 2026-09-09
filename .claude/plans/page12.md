# Page 12: REST API Completion

# Objective
The remaining `/sessions*` REST endpoints, all validated with Zod, closing
out the COMMAND API surface from ARCHITECTURE.md except pairing/auth
(page14) and cancel-in-progress-dispatch (out of scope, see page11's Risks).

# A gap found while wiring this page
`SessionRegistry.startSession({ initialInstruction })` (page9) dispatches
the initial instruction directly through the adapter — it never goes
through `TaskRegistry` (page11), so a session started with an initial
instruction gets **no Task record** for it, contradicting page11's whole
point ("every dispatched instruction produces a persisted Task"). Rather
than change `SessionRegistry`/`TaskRegistry`'s tested contracts (both are
used directly, without an initial instruction going through Task tracking,
by their own existing unit tests — that usage is fine at that layer), the
fix lives at the HTTP boundary: `POST /sessions` always calls
`sessionRegistry.startSession` *without* `initialInstruction`, then, if one
was given, calls `taskRegistry.dispatchInstruction` separately. This makes
the HTTP layer the single place where "every instruction is tracked" is
actually enforced end-to-end — lower-level registry tests can still
exercise `startSession`'s own `initialInstruction` param directly (useful
for testing the adapter-dispatch mechanics in isolation) without that being
the production path.

# Implementation
1. `domain/errors.ts` — add `NoCancellableTaskError` (code
   `INVALID_CANCEL_TARGET`, maps to 400 via the existing generic
   `domainErrorHttpStatus`).
2. `domain/task/registry.ts` — `TaskRegistry.cancelLatestTaskForSession
   (sessionId)`: validates the session exists (`SessionNotFoundError`),
   finds the most recent task still in a cancellable state (`QUEUED`,
   `DISPATCHING`, or `WAITING` — same set `TASK_STATUS_TRANSITIONS` allows
   `-> CANCELLED` from), cancels it via the existing `cancelTask`. Throws
   `NoCancellableTaskError` if none found.
3. `api/http/sessions.ts` — replace the page10 stub with the full router:
   - `POST /` — `StartSessionRequestSchema` (already in `packages/protocol`
     since page2); orchestrates the gap-fix above.
   - `GET /` — optional `?projectId=` filter via `SessionRegistry.listSessions`.
   - `GET /:id` — `SessionRegistry.getSession`.
   - `GET /:id/events` — unchanged from page10.
   - `GET /:id/tasks` — `TaskRegistry.listTasksForSession` (not named in
     the spec's original endpoint list, but directly needed by page18's
     "Task history" screen and trivially supported by page11's existing
     `TaskRegistry` — adding it now avoids redoing this page later for a
     one-line gap).
   - `POST /:id/instructions` — `SendInstructionRequestSchema` (already in
     `packages/protocol`); delegates to `TaskRegistry.dispatchInstruction`,
     returns the `Task`.
   - `POST /:id/resume` — `SessionRegistry.resumeSession`.
   - `POST /:id/stop` — `SessionRegistry.stopSession`, then returns the
     refreshed session.
   - `POST /:id/cancel` — `TaskRegistry.cancelLatestTaskForSession`.
4. `server.ts`/`lifecycle.ts` — `AppDeps` gains `taskRegistry`;
   `lifecycle.ts` constructs `SqliteTaskRepository` + `TaskRegistry` and
   passes it through.

# Files Changed
Modified: `domain/errors.ts`, `domain/task/registry.ts` (+ its test),
`api/http/sessions.ts` (+ its test, substantially expanded), `server.ts`,
`lifecycle.ts`, `server.test.ts`, `api/http/projects.test.ts` (fixture
updates for the new required `taskRegistry` dep).

# Tests
Full route coverage (against `FakeClaudeSessionAdapter`, real SQLite
repositories): create/list/inspect sessions, dispatch an instruction and
confirm a `Task` comes back, resume, stop, cancel (including the
no-cancellable-task 400 case), `GET /:id/tasks`, and the `POST /sessions`
gap-fix itself (assert a `Task` row exists for a session started with an
`initialInstruction`). `npm run typecheck`, `npm run lint`, `npm test`
green from root.

# Acceptance Criteria
- [ ] Every route validates its body/query with Zod; no unvalidated input
      reaches a registry.
- [ ] `POST /sessions` with an `initialInstruction` produces both a session
      and a `Task` row for that instruction — verified by test (the gap
      this page exists partly to close).
- [ ] `POST /:id/cancel` returns 400 (`INVALID_CANCEL_TARGET`) when there is
      nothing cancellable, not a 500 or a silent no-op.
- [ ] All tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- Cancelling a task that's genuinely `RUNNING` (an in-flight dispatch) is
  still unsupported (page11's documented limitation) — `POST /:id/cancel`
  only reaches `QUEUED`/`DISPATCHING`/`WAITING` tasks, and a `RUNNING` one
  is silently *not* the one picked (the search only considers cancellable
  states), which could surprise a caller expecting "cancel my active
  dispatch." Flagged, not hidden — closing it needs adapter-level
  cancellation wired to the task layer, out of scope here.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page13.md` written (WebSocket API) before starting page13
