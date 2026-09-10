# Page 20: CommandRouter/IntentResolver interfaces

# Objective
The typed command surface ADR-005 requires: a `CommandRouter` that
dispatches a typed `Command` to the right registry method, and an
`IntentResolver` interface (no implementation — ADR-005 is explicit that
no LLM-backed resolver ships in Phase 1) for a future natural-language
front end (voice/WhatsApp) to translate free text into that same typed
`Command`. Per the roadmap, this isn't inert scaffolding: it's wired in
now to route the mobile-issued session commands, proving the abstraction
before voice ever needs it.

# Why
`ARCHITECTURE.md`'s data-flow section already describes the target shape:
mobile calls REST today; a future voice/WhatsApp source is "translated
into that same call by `CommandRouter` + `IntentResolver`". Building that
translation target now — and routing today's only caller (the REST layer)
through it — means when page-future adds a real `IntentResolver`, it's a
new adapter producing a `Command`, not a rewrite of how commands execute
(ADR-005's whole point).

# Scope
Four *mutating* session operations — the ones ADR-005 names as the
cross-source surface ("get status, send instruction, resume, stop") plus
cancel, which is the same shape: `SEND_INSTRUCTION`, `RESUME_SESSION`,
`STOP_SESSION`, `CANCEL_TASK`. "Get status" is a plain `GET` (no
mutation, nothing to route) so it's left as a direct registry read.
`StartSession`/`CreateProject` are setup/admin actions, not the kind of
mid-conversation command a voice/WhatsApp source would issue, and adding
them would widen this page well past what ADR-005 actually asks for —
left as direct REST calls, revisitable later if a real `IntentResolver`
ever needs to create things too.

# Design
- `domain/command/types.ts` — the `Command` discriminated union:
  ```ts
  export type Command =
    | { type: "SEND_INSTRUCTION"; sessionId: string; instruction: string }
    | { type: "RESUME_SESSION"; sessionId: string }
    | { type: "STOP_SESSION"; sessionId: string }
    | { type: "CANCEL_TASK"; sessionId: string };
  ```
- `domain/command/router.ts` — `CommandRouter`, constructed with
  `SessionRegistry` + `TaskRegistry`, one `dispatch(command)` method that
  switches on `command.type` and calls the existing registry method
  (`taskRegistry.dispatchInstruction`, `sessionRegistry.resumeSession`,
  `sessionRegistry.stopSession` + re-fetch, `taskRegistry.
  cancelLatestTaskForSession`) — no new business logic, purely a typed
  dispatch layer over what already exists and is already tested.
- `domain/command/intent-resolver.ts` — the interface only:
  ```ts
  export interface IntentResolver {
    resolve(input: string): Promise<Command | null>;
  }
  ```
  No implementation. A docstring makes the ADR-005 rationale and "no
  Phase 1 impl" explicit so nobody mistakes the empty file for an
  oversight.
- Placement: `domain/command/`, not the `orchestration/command-router/`
  path `ARCHITECTURE.md` sketches — matching the precedent already set by
  reconciliation, which also landed under `domain/` rather than the
  sketched `orchestration/` tree (no other orchestration-layer component
  exists to justify a new top-level directory for one module).
- `api/http/sessions.ts` — the four routes affected
  (`/instructions`, `/resume`, `/stop`, `/cancel`) build a `Command` from
  the validated request and call `commandRouter.dispatch(command)`
  instead of calling the registries directly. Route-level Zod validation
  is unchanged; only what happens after validation changes.
- `server.ts`/`lifecycle.ts`/`test-support/build-test-app.ts` — thread a
  constructed `CommandRouter` through `AppDeps` into
  `createSessionsRouter`.

# Implementation
1. `domain/command/types.ts`.
2. `domain/command/router.ts` (+ test — one case per `Command` variant,
   asserting it calls through to the right registry method and returns
   its result).
3. `domain/command/intent-resolver.ts` (interface only).
4. `api/http/sessions.ts` — route through `CommandRouter` for the four
   mutating endpoints.
5. `server.ts` (`AppDeps.commandRouter`), `lifecycle.ts` (construct +
   pass), `test-support/build-test-app.ts` (construct + pass — every
   existing `sessions.test.ts` case for these four routes keeps passing
   unchanged, since behavior is identical, only the internal path
   changed).

# Files Changed
New: `apps/controller/src/domain/command/{types,router,intent-resolver}.ts`
(+ `router.test.ts`). Modified: `apps/controller/src/api/http/sessions.ts`,
`apps/controller/src/server.ts`, `apps/controller/src/lifecycle.ts`,
`apps/controller/src/test-support/build-test-app.ts`.

# Tests
`router.test.ts`: one case per `Command` variant. Existing
`sessions.test.ts` (15 cases covering these same four routes) must keep
passing unchanged — this page must not change observable REST behavior,
only the internal dispatch path. `npm run typecheck`, `npm run lint`,
`npm test` green from root. Real end-to-end manual check (same
`startController()` pattern as page19): hit `/instructions`, `/resume`,
`/stop`, `/cancel` over real HTTP against a live controller and confirm
each still produces correct results — proof the route change didn't
silently alter behavior, not just that the unit tests still pass.

# Acceptance Criteria
- [x] `CommandRouter` dispatches all four `Command` variants correctly.
- [x] `IntentResolver` interface exists, matches ADR-005's "no
      implementation in Phase 1" — no LLM/NLP code added.
- [x] The four mutating session routes go through `CommandRouter`; their
      existing tests pass unchanged (proof behavior didn't shift).
- [x] All tests pass; typecheck and lint clean.
- [x] `.claude/PROGRESS.md` updated.

# Risks
- Low risk: this page reroutes internal plumbing behind already-tested,
  already-stable registry methods — no new state, no new failure mode.
  The main risk is scope creep (routing routes that ADR-005 doesn't
  actually call out) — addressed above by writing down the four-command
  scope decision explicitly rather than deciding silently mid-implementation.

# Completion Checklist
- [x] All Acceptance Criteria checked
- [x] `.claude/CHANGELOG.md` entry added
- [x] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page21.md` written (24/7 hardening & reliability
      pass — the final Phase 1 page) before starting page21
