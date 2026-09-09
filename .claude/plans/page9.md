# Page 9: Session Registry

# Objective
`SessionRegistry`: the domain service that wraps a `ClaudeSessionAdapter`
(page7/page8) with SQLite persistence, status tracking, and event
subscription — the same entity/repository/registry layering pattern page6
established for projects, applied to sessions. No HTTP routes yet (that's
page12, per MASTER_PLAN.md — deliberately kept separate this time).

# Why
ARCHITECTURE.md's SESSION REGISTRY section requires: discover, register,
associate with project, update status, store Claude session id, track
output/errors, emit state changes — independent of the Claude Code-specific
implementation (already achieved via the `ClaudeSessionAdapter` port).
Building this now (adapter-agnostic — works with `FakeClaudeSessionAdapter`
or `ClaudeCodeAdapter` identically) lets page10 (event bus) and page12
(REST API) build on real persisted, adapter-backed session state.

# A gap found while designing this page
`ClaudeSessionAdapter` (page7) exposes `getStatus(id): Promise<SessionStatus>`
but nothing that returns the *full* current `ClaudeSession` (claudeSessionId,
lastOutput, lastActivityAt, ...) after a dispatch. `sendInstruction` returns
only an `InstructionResult`; `resumeSession`/`stopSession` don't return
enough either. The registry needs the whole record to persist accurately.
Fix: add `getSession(sessionId): Promise<ClaudeSession>` to the port
(mirrors `getStatus`, same not-found behavior) — trivial for both existing
implementations, since each already keeps a full `ClaudeSession` internally.
Safe to amend now: no page beyond this one depends on the port yet.

# Prerequisites
Page6 (registry/repository pattern), page7 (port), page8 (real adapter) done.

# Implementation
1. `domain/session/adapter.ts` — add `getSession(sessionId): Promise<ClaudeSession>`
   to `ClaudeSessionAdapter`; implement in `FakeClaudeSessionAdapter` and
   `ClaudeCodeAdapter` (both just `return this.requireSession(sessionId)`).
2. `domain/session/repository.ts` — `SessionRepository` interface: `create`,
   `findById`, `list`, `listByProject`, `update`, `remove`.
3. `db/migrations/0003_sessions.sql` — `sessions` table (id, project_id
   REFERENCES projects(id), claude_session_id, status, current_task,
   process_id, terminal_id, last_output, last_error, started_at,
   last_activity_at). No `ON DELETE` clause — with `foreign_keys = ON`
   (already enabled, page4), SQLite's default behavior blocks deleting a
   project that still has sessions. Resolves the "cascade or block?"
   question RISKS.md flagged after page6: **block**, deliberately, so a
   project can't be silently orphaned out from under its sessions; if that
   turns out to be the wrong default it's a one-line migration to change,
   not a design that needs guessing now.
4. `adapters/persistence/sqlite/session-repository.ts` —
   `SqliteSessionRepository implements SessionRepository`, same
   snake_case-row <-> `ClaudeSessionSchema` mapping pattern as page6's
   project repository.
5. `domain/session/registry.ts` — `SessionRegistry`:
   - `startSession(input: { projectId, initialInstruction?, name? })` —
     resolves the project via `ProjectRegistry.getProject` (throws
     `ProjectNotFoundError` if unknown — this is how "associate session
     with project" is enforced, not a bare foreign key check), calls
     `adapter.startSession` with the resolved `projectPath`, persists the
     result.
   - `getSession(id)` — throws `SessionNotFoundError` if not persisted.
   - `listSessions(projectId?)`.
   - `sendInstruction(sessionId, instruction)` — verifies the session
     exists, delegates to the adapter, then re-syncs full state from
     `adapter.getSession` into the repository (single source of truth for
     "what actually happened," not a manual field-by-field merge).
   - `resumeSession(sessionId)` / `stopSession(sessionId)` — same
     delegate-then-resync pattern.
   - `subscribe(sessionId, handler)` — thin delegation to
     `adapter.subscribe`, the "event emission" hook page10's future event
     bus will consume. Not building a second pub-sub layer here — one
     already exists (the adapter's), and duplicating it now would be
     guessing at page10's needs.
6. Tests: against `FakeClaudeSessionAdapter` + a real (temp-file) SQLite
   `SqliteSessionRepository` (integration-style, matching how page6 tested
   `ProjectRegistry`): full lifecycle (start with/without initial
   instruction, send instruction, resume, stop), `ProjectNotFoundError` on
   an unknown project, `SessionNotFoundError` on an unknown session,
   persisted state matches adapter state after each operation, and a
   dedicated `SqliteSessionRepository` round-trip test (including the FK
   block-on-delete behavior).

# Files Changed
New: `domain/session/repository.ts`, `domain/session/registry.ts` (+
tests), `db/migrations/0003_sessions.sql`,
`adapters/persistence/sqlite/session-repository.ts` (+ test). Modified:
`domain/session/adapter.ts`, `adapters/fake/fake-claude-session-adapter.ts`,
`adapters/claude-code/claude-code-adapter.ts` (both + their tests, for
`getSession`).

# Tests
Per above; `npm run typecheck`, `npm run lint`, `npm test` green from root.

# Acceptance Criteria
- [ ] `SessionRegistry` never talks to SQLite directly and never imports
      `ClaudeCodeAdapter` — only the `SessionRepository` and
      `ClaudeSessionAdapter` interfaces, verified by construction (its
      tests only ever pass `FakeClaudeSessionAdapter`).
- [ ] Starting a session for an unknown project throws `ProjectNotFoundError`
      (no orphaned session ever gets created).
- [ ] Every session operation leaves the repository's record consistent
      with the adapter's own state (verified by test, not assumed).
- [ ] Deleting a project that still has sessions is blocked by the FK
      constraint (verified by test).
- [ ] No HTTP routes added — deferred to page12 per the roadmap.
- [ ] All tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- `subscribe`'s thin delegation means page10 must still do its own
  translation from `SessionAdapterEvent` to `DomainEvent` — deliberately
  not pre-built here since page10 hasn't shaped that mapping yet.
- The FK-blocks-delete decision (vs. cascade) is a real product decision,
  not just a technical default — flagged here for the user to override
  later if session cascade-delete turns out to be the desired UX.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page10.md` written (event system + EventRepository)
      before starting page10
