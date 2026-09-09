# Page 11: Task System

# Objective
A `Task` entity/state machine/repository (mirroring the session pattern) and
a `TaskRegistry` that wraps `SessionRegistry.sendInstruction`, so every
instruction dispatch produces a persisted `Task` record — the spec's "what
did I tell Project A to do?" requirement. No HTTP routes this page (the
roadmap places none here — page12 does the REST surface).

# Why
The spec's TASK MODEL section is explicit that a ClaudeOps task is a
separate model from Claude's own internal turn/message concept: "The system
must remember: 'What did I tell Project A to do?'" `SessionRegistry`
(page9) already dispatches instructions and syncs session state, but
nothing records the instruction itself as a first-class, queryable,
state-tracked entity. This page adds that without touching
`SessionRegistry` — `TaskRegistry` wraps it.

# Implementation
1. `packages/protocol/src/task.ts` — add `TASK_STATUS_TRANSITIONS` +
   `isValidTaskTransition`, mirroring `session.ts`'s pattern (single source
   of truth, reused by domain code and tests):
   ```
   QUEUED       -> DISPATCHING, CANCELLED
   DISPATCHING  -> RUNNING, FAILED, CANCELLED
   RUNNING      -> WAITING, COMPLETED, FAILED
   WAITING      -> RUNNING, COMPLETED, FAILED, CANCELLED
   COMPLETED / FAILED / CANCELLED -> (terminal, no outgoing transitions)
   ```
   `RUNNING -> CANCELLED` is deliberately omitted: our dispatch flow is one
   synchronous `await` chain (page8/page9), so there's no way to safely
   interrupt a truly in-flight dispatch at the task layer — that's
   `stopSession`'s job (session-level, page8), not a task-state flip.
   `WAITING -> CANCELLED` covers the realistic case (a task paused on
   permission that the user decides not to grant).
2. `domain/errors.ts` — add `TaskNotFoundError` (needed by this page).
3. `domain/task/state-machine.ts` — `applyTransition`, identical shape to
   `domain/session/state-machine.ts`.
4. `domain/task/entity.ts` — `createTask({projectId, sessionId,
   instruction})` (status `QUEUED`) and `transitionTask(task, target,
   logger)`: immutable, self-validating against `TaskSchema`, and — unlike
   session's transition (which only bumps `lastActivityAt`) — sets
   `startedAt` the first time a task reaches `RUNNING` and `completedAt`
   the moment it reaches any terminal status. This bookkeeping lives here,
   once, rather than being duplicated in `TaskRegistry`.
5. `domain/task/outcome.ts` — `INSTRUCTION_RESULT_TO_TASK_STATUS`:
   `completed -> COMPLETED`, `waiting_for_input`/`waiting_for_permission`
   -> `WAITING`, `failed -> FAILED`.
6. `domain/task/repository.ts` — `TaskRepository`: `create`, `findById`,
   `listBySession`, `update`.
7. `db/migrations/0005_tasks.sql` — `tasks` table, `project_id`/`session_id`
   `REFERENCES` (no `ON DELETE`, same block-on-delete default as page9's
   `sessions` table — consistency, not a new decision).
8. `adapters/persistence/sqlite/task-repository.ts` — same row-mapping
   pattern as page6/page9.
9. `domain/task/registry.ts` — `TaskRegistry`:
   - `dispatchInstruction(sessionId, instruction)`: resolves the session via
     `SessionRegistry.getSession` (throws `SessionNotFoundError`, and gives
     the `projectId` a `Task` needs), creates the task (`QUEUED`), persists,
     transitions `DISPATCHING` -> `RUNNING`, calls
     `SessionRegistry.sendInstruction`, maps the result to a final task
     status via `INSTRUCTION_RESULT_TO_TASK_STATUS`, persists, returns the
     task. If `sendInstruction` itself throws, the task is transitioned to
     `FAILED` before the error is re-thrown — a task is never left stuck in
     `RUNNING`.
   - `getTask(id)` — throws `TaskNotFoundError` if unknown.
   - `listTasksForSession(sessionId)`.
   - `cancelTask(id)` — transitions a persisted task to `CANCELLED` (valid
     only from `QUEUED`/`DISPATCHING`/`WAITING` per the table above).
10. Tests: protocol-level transition table test, entity tests
    (`startedAt`/`completedAt` bookkeeping, immutability), repository
    round-trip + FK block-on-delete, registry tests against
    `FakeClaudeSessionAdapter` covering completed/waiting/failed outcomes,
    a thrown-dispatch-error case, `SessionNotFoundError`/`TaskNotFoundError`,
    and `cancelTask`'s valid/invalid-source cases.

# Files Changed
New: `domain/task/{state-machine,entity,outcome,repository,registry}.ts` (+
tests), `db/migrations/0005_tasks.sql`,
`adapters/persistence/sqlite/task-repository.ts` (+ test). Modified:
`packages/protocol/src/task.ts` (+ its test), `domain/errors.ts`.

# Tests
Per above; `npm run typecheck`, `npm run lint`, `npm test` green from root.

# Acceptance Criteria
- [ ] Every `SessionRegistry.sendInstruction` dispatched through
      `TaskRegistry` produces a persisted `Task` whose final status matches
      the real `InstructionResult` outcome.
- [ ] A task is never left in `RUNNING` after `dispatchInstruction`
      settles, even when the adapter call throws.
- [ ] `startedAt`/`completedAt` are set at the correct transitions, not
      speculatively elsewhere.
- [ ] `SessionRegistry` is unmodified by this page — `TaskRegistry` only
      wraps it.
- [ ] No HTTP routes added — deferred to page12 per the roadmap.
- [ ] All tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- `RUNNING -> CANCELLED` being unsupported is a real product-behavior gap
  (no "cancel a task that's actively running") — flagged here, not hidden;
  closing it properly needs adapter-level cancellation wired through to the
  task layer, which is beyond this page's scope.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page12.md` written (REST API completion) before
      starting page12
