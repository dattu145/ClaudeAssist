# Test Plan

Framework: Vitest across `apps/controller`, `packages/*`. Mobile gets Vitest +
`@testing-library/react-native` for components/hooks once built.

## Layers
- **Unit** — state machine transition validation, Zod schema validation,
  repository logic against an in-memory/temp SQLite file, event bus fan-out.
- **Integration** — HTTP routes via `supertest`-equivalent against a real
  (temp-file) SQLite instance and a `FakeClaudeSessionAdapter`; WS protocol
  round-trips (connect, subscribe, receive events).
- **Adapter (fake)** — `FakeClaudeSessionAdapter` implements
  `ClaudeSessionAdapter` deterministically (scripted state transitions, no real
  `claude` process) so the rest of the suite never depends on real Claude
  usage or network/API calls.
- **Adapter (real, opt-in)** — a small, explicitly-tagged suite that shells out
  to the real `claude` CLI in print mode against a throwaway scratch project,
  to validate research/claude-code.md's assumptions still hold. Not run by
  default in CI-less local dev; run manually or behind an env flag.
- **Recovery** — kill the controller mid-task, restart, assert reconciliation
  produces correct states (architecture/session-model.md reconciliation
  algorithm) against a `FakeClaudeSessionAdapter` that simulates a process
  having died.
- **State-machine** — exhaustive table test of allowed/rejected transitions
  from architecture/session-model.md.

## Gate for "done" on any page
A page's Acceptance Criteria (see plans/page*.md) are not met until its tests
are green and reviewed — no page is marked complete in PROGRESS.md otherwise.
