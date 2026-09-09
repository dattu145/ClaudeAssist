# Page 10: Event System + EventRepository

# Objective
A typed in-process `EventBus`, a `DomainEvent`-persisting `EventRepository`
(SQLite), the `SessionAdapterEvent -> DomainEvent` translation page9 left
open, and the one REST endpoint the roadmap places here: `GET
/sessions/:id/events`. This is also the first page that wires
`SessionRegistry`/`ClaudeCodeAdapter` into the actual running controller
(`lifecycle.ts`) — nothing has mounted a real adapter into the app until now.

# Why
architecture/event-system.md requires every important state change to
become a persisted `DomainEvent`. page9 deliberately left `SessionRegistry`
publishing nothing beyond a thin adapter-event delegation, since the bus and
the translation shape didn't exist yet — this page builds both.

# A timing bug found while designing this page
`SessionRegistry.startSession` (page9) subscribes to adapter events *after*
`adapter.startSession(...)` resolves. But when `startSession` is called with
an `initialInstruction`, the adapter dispatches and fires events (output,
status_changed, completed) *during* that same call, before it returns —
so a registry that subscribes afterward would silently miss the entire
first dispatch's events. Fix: `SessionRegistry` now generates the session id
itself (`generateId("session")`) and subscribes *before* calling
`adapter.startSession`, passing the id through. This requires
`StartSessionInput` to accept an optional `sessionId` (distinct from
`claudeSessionId`, the CLI's own conversation id) and `createSession` to
accept an optional id override — both adapters already keyed everything off
whatever id `createSession` produced, so honoring a caller-supplied one is a
small, safe change caught and fixed before any page depended on the old
timing.

# Prerequisites
Page9 (SessionRegistry, ProjectRegistry) done.

# Implementation
1. `domain/session/entity.ts` — `createSession` accepts optional `id`.
2. `domain/session/adapter.ts` — `StartSessionInput` gains optional
   `sessionId`; both adapters use it when present instead of generating
   their own.
3. `domain/events/bus.ts` — `EventBus` interface (`publish`, `subscribe`)
   + `InProcessEventBus`: synchronous fan-out, a throwing handler is caught
   and logged, never crashes `publish` or other subscribers.
4. `domain/events/translate-session-event.ts` —
   `translateSessionEvent(session: {id, projectId}, event: SessionAdapterEvent):
   DomainEvent`. Mapping: `output` -> `SESSION_OUTPUT`, `completed` ->
   `SESSION_COMPLETED`, `failed` -> `SESSION_FAILED`, `stopped` ->
   `SESSION_STOPPED`, `disconnected` -> `SESSION_DISCONNECTED`;
   `status_changed` inspects `data.current` for the more specific type where
   directly derivable (`STARTING` -> `SESSION_STARTED`,
   `WAITING_FOR_INPUT`/`WAITING_FOR_PERMISSION` -> their matching types),
   else falls back to generic `SESSION_STATUS_CHANGED`. `SESSION_DISCOVERED`
   (page16's reconciliation), `SESSION_TASK_STARTED`/`SESSION_TASK_PROGRESS`
   (page11's task system), and `SESSION_ERROR` (reserved for a future
   infrastructure-vs-domain-failure distinction) are not reachable from this
   translation — not forced, not guessed at.
5. `domain/session/registry.ts` — gains an `EventBus` constructor
   dependency; `startSession` generates the id upfront, subscribes before
   calling the adapter, and every subsequent adapter event is translated and
   published for the session's whole lifetime.
6. `domain/events/repository.ts` — `EventRepository` interface: `create`,
   `listBySession(sessionId, limit?)`.
7. `db/migrations/0004_events.sql` — `events` table. Deliberately **no**
   foreign keys: an append-only log must survive its referenced
   project/session being removed later.
8. `adapters/persistence/sqlite/event-repository.ts` —
   `SqliteEventRepository`, same row-mapping pattern as page6/page9,
   `payload` stored as a JSON string column.
9. `domain/events/wire-persistence.ts` — `wireEventPersistence(bus,
   repository, logger)`: subscribes the repository to the bus, logs (never
   throws) if persisting one event fails.
10. `api/http/sessions.ts` — `GET /sessions/:id/events` only (the rest of
    `/sessions*` is page12, deliberately not built here). 404s via
    `SessionNotFoundError` if the session doesn't exist.
11. `server.ts`/`lifecycle.ts` — `AppDeps` gains `sessionRegistry` and
    `eventRepository`; `lifecycle.ts` now constructs the real
    `ClaudeCodeAdapter`, `InProcessEventBus`, `SqliteEventRepository` (wired
    to persist), and `SessionRegistry`, and mounts the new router. First
    page where the real adapter is actually reachable from the running
    controller — though still only via this one read-only route.

# Files Changed
New: `domain/events/{bus,translate-session-event,repository,
wire-persistence}.ts` (+ tests), `db/migrations/0004_events.sql`,
`adapters/persistence/sqlite/event-repository.ts` (+ test),
`api/http/sessions.ts` (+ test). Modified: `domain/session/{entity,adapter,
registry}.ts` (+ their tests), `adapters/fake/fake-claude-session-adapter.ts`,
`adapters/claude-code/claude-code-adapter.ts` (both + tests, for
`sessionId` passthrough), `server.ts`, `lifecycle.ts`, `server.test.ts`.

# Tests
Per above, plus a `SessionRegistry` test proving the timing fix: subscribe
via the registry, start a session *with* an initial instruction, assert the
first dispatch's events were still delivered. `npm run typecheck`, `npm run
lint`, `npm test` green from root.

# Acceptance Criteria
- [ ] No `SessionAdapterEvent` is ever missed by the event bus, including
      those from a session's very first (initial-instruction) dispatch —
      verified by test, since this is exactly the bug found while planning.
- [ ] Every published `DomainEvent` is persisted (verified against a real
      SQLite `EventRepository`, not a mock).
- [ ] `GET /sessions/:id/events` returns a schema-valid, time-ordered event
      list; 404s for an unknown session.
- [ ] `lifecycle.ts` wires the real `ClaudeCodeAdapter` — grep-verifiable,
      not just claimed.
- [ ] All tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- `InProcessEventBus` is synchronous and unbounded (no backpressure) — fine
  for Phase 1's expected volume; revisit only if profiling shows an issue
  (RISKS.md already flags SQLite write contention generally).
- The `status_changed` -> specific-type inference is a judgment call, not a
  contractual mapping — documented inline so it's easy to revisit if page13
  (WS layer) or a client finds it surprising.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page11.md` written (Task system) before starting page11
