# Page 7: ClaudeSessionAdapter Interface + FakeClaudeSessionAdapter

# Objective
Define the `ClaudeSessionAdapter` port (the abstraction the Session Registry,
page9, will depend on) and ship a deterministic `FakeClaudeSessionAdapter`
implementation, built *before* the real `ClaudeCodeAdapter` (page8) so every
downstream page (9, 10, 11, 12, 13) can be developed and tested against a
fake that never shells out to the real `claude` CLI — per TEST_PLAN.md's
"Adapter (fake)" layer and the spec's explicit requirement.

# Why
ARCHITECTURE.md and the spec's CLAUDE CODE INTEGRATION section require a
clean adapter abstraction so the registry/API/event layers never depend on
Claude Code specifics. Building the fake first (rather than deriving it from
the real adapter after the fact) forces the interface to be genuinely
adapter-agnostic from day one, and unblocks page9+ without waiting on page8.

# Prerequisites
Page5 (session state machine/entity — `createSession`/`transitionSession`,
which the fake reuses so its behavior stays consistent with the real
state machine) and page6 (established the domain/interface/impl layering
pattern this page repeats) done.

# Implementation
1. `apps/controller/src/domain/session/adapter.ts` — the port, adapted from
   the spec's conceptual interface after weighing it against
   research/claude-code.md's findings:
   - `StartSessionInput { projectId: string; projectPath: string;
     initialInstruction?: string; name?: string }` (`projectPath` included
     because the real adapter, page8, needs a cwd to spawn `claude` in —
     the spec's example omits it but the real implementation can't work
     without it).
   - `InstructionResult { status: "completed" | "waiting_for_input" |
     "waiting_for_permission" | "failed"; output?: string; error?: string }`
     — mirrors the session states an instruction dispatch can end in per
     architecture/session-model.md.
   - `SessionAdapterEvent { type: "output" | "status_changed" | "completed"
     | "failed" | "stopped" | "disconnected"; sessionId: string; timestamp:
     string; data: unknown }`, `SessionEventHandler`, `Unsubscribe`.
   - `ClaudeSessionAdapter` interface: `discoverSessions`, `startSession`,
     `sendInstruction`, `resumeSession`, `stopSession`, `getStatus`,
     `subscribe` — matches the spec's conceptual shape; the only
     deliberate addition is `projectPath` on `StartSessionInput`, justified
     above and noted inline as a comment referencing the spec line "Do not
     blindly use this exact API if the official Claude Code interfaces
     suggest a better design."
2. `apps/controller/src/adapters/fake/fake-claude-session-adapter.ts` —
   `FakeClaudeSessionAdapter implements ClaudeSessionAdapter`:
   - Holds sessions in-memory as real `ClaudeSession` entities (reuses
     page5's `createSession`/`transitionSession`, not ad hoc fake objects),
     so tests exercise the same state machine the real adapter will drive.
   - `startSession` creates a session, transitions DISCOVERED -> STARTING
     -> WORKING (or -> WAITING_FOR_INPUT if no `initialInstruction`,
     matching a session that's up but idle), emitting `status_changed`
     events at each step.
   - `sendInstruction` is scriptable per-session via
     `queueInstructionOutcome(sessionId, outcome)` (test setup call, not
     part of the port interface) — defaults to `"completed"` if nothing is
     queued. Applies the matching session transition (WORKING ->
     COMPLETED/WAITING_FOR_INPUT/WAITING_FOR_PERMISSION/FAILED) and emits
     `output` + `status_changed` events.
   - `stopSession` transitions to `STOPPED`; `resumeSession` transitions a
     `STOPPED`/`FAILED` session back through `STARTING` -> `WORKING`.
   - `discoverSessions` returns all known sessions; `getStatus` returns a
     session's current status (throws if unknown — mirrors a real
     not-found case the registry, page9, will need to handle).
   - `subscribe` is a simple per-session listener registry returning an
     unsubscribe function; events fire synchronously (deterministic for
     tests — no real async I/O to simulate).
3. Tests: full lifecycle (start -> instruction -> complete), scripted
   outcomes (waiting-for-input, waiting-for-permission, failed), stop/resume,
   subscribe/unsubscribe (an event after unsubscribe is not delivered),
   discoverSessions reflects all started sessions, getStatus throws for an
   unknown session id.

# Files Changed
New: `apps/controller/src/domain/session/adapter.ts`,
`apps/controller/src/adapters/fake/fake-claude-session-adapter.ts` + test.

# Tests
Per above; `npm run typecheck`, `npm run lint`, `npm test` green from root.

# Acceptance Criteria
- [ ] `ClaudeSessionAdapter` has zero Claude-Code-specific types or
      assumptions leaking into it (no CLI flags, no process concepts) —
      it's implementable by both the fake and, next page, the real adapter.
- [ ] `FakeClaudeSessionAdapter` drives sessions through the real
      `SESSION_STATUS_TRANSITIONS` state machine (page5), never bypasses it.
- [ ] Every adapter method the interface declares is implemented and
      tested, including the not-found and unsubscribe edge cases.
- [ ] All tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- Designing `SessionAdapterEvent`'s shape now, before page9 (which consumes
  it) or page10 (the domain event bus, which it ultimately feeds), risks
  guessing wrong. Kept deliberately minimal (`type`/`sessionId`/`timestamp`/
  `data: unknown`) so page9/page10 can shape the translation into
  `DomainEvent` without this page over-committing to a richer shape.
- `queueInstructionOutcome` is a fake-only test hook, not part of the port —
  keeping it clearly outside `ClaudeSessionAdapter` avoids the real adapter
  (page8) being pressured to implement a method that makes no sense for it.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page8.md` written (`ClaudeCodeAdapter`, the real
      implementation) before starting page8
