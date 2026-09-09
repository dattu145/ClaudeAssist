# Page 2: packages/protocol & packages/config

# Objective
Create the single source of truth for wire/domain types (`packages/protocol`,
Zod schemas for Project/Session/Task/Event + REST/WS envelopes) and for
controller configuration (`packages/config`, Zod-validated env schema). No
server, no routes, no business logic yet — just the typed contracts everything
else builds on.

# Why
ARCHITECTURE.md requires the mobile client and controller to share one set of
request/response types (no hand-duplicated types) and requires config to be
loaded once via a validated schema rather than scattered `process.env` reads.
Doing this before page4 (controller foundation) means the HTTP/WS layer is
built directly against real validated schemas instead of ad hoc types that get
retrofitted later.

# Prerequisites
Page1 complete (monorepo, workspaces, TS project references, lint/test
wired). `zod` added as a dependency.

# Implementation
1. Add `zod` to root devDependencies is wrong — it's a runtime dependency of
   `packages/protocol` and `packages/config` specifically; add it there.
2. `packages/protocol`:
   - `src/session.ts` — `SessionStatus` enum (the 11 states from
     architecture/session-model.md) and `ClaudeSessionSchema`.
   - `src/project.ts` — `ProjectStatusSchema`, `ProjectSchema`.
   - `src/task.ts` — `TaskStatusSchema` (QUEUED/DISPATCHING/RUNNING/WAITING/
     COMPLETED/FAILED/CANCELLED), `TaskSchema`.
   - `src/event.ts` — `DomainEventTypeSchema` (13 types from
     architecture/event-system.md), `DomainEventSchema`.
   - `src/ws-protocol.ts` — versioned WS envelope schema
     (`{ version, type, timestamp, sessionId, projectId, data }`) plus a
     mapping helper type from `DomainEventType` to WS `type` strings
     (e.g. `SESSION_STATUS_CHANGED` -> `"session.status_changed"`).
   - `src/api.ts` — request/response Zod schemas for the REST endpoints listed
     in ARCHITECTURE.md (`POST /projects`, `POST /sessions/:id/instructions`,
     etc.) — bodies only; path params validated separately in page12.
   - `src/index.ts` — re-exports everything + inferred TS types
     (`z.infer<...>`) so both controller and mobile import types, not just
     runtime schemas.
   - Unit tests: valid/invalid payloads for each schema, and a state-machine
     transition table test reused later by page5 (defining the transition map
     here as data, since it's a protocol-level constant both domain code and
     tests need).
3. `packages/config`:
   - `src/schema.ts` — Zod schema mirroring `.env.example`
     (`PORT` number w/ default 4000, `DATA_DIR` string w/ default
     `~/.claudeops`, `LOG_LEVEL` enum w/ default `info`,
     `PAIRING_TOKEN_TTL` number w/ default 2592000,
     `DISCOVERY_POLL_INTERVAL_MS` number w/ default 15000).
   - `src/load.ts` — `loadConfig(env = process.env)` parses + validates,
     throws a clear aggregated error listing every invalid var (not just the
     first) on failure.
   - `src/index.ts` — re-exports schema, `loadConfig`, `Config` type.
   - Unit tests: defaults apply when env is empty; invalid values rejected
     with a useful message; valid overrides pass through correctly.
4. Wire both into root `tsconfig.json` references and `vitest.config.ts`
   include globs.
5. `apps/controller` depends on both packages (package.json + tsconfig
   references) — no usage yet beyond what's needed to prove wiring; real
   usage starts at page4.

# Files Changed
New: `packages/protocol/*`, `packages/config/*`. Modified: root
`tsconfig.json`, `vitest.config.ts`, `apps/controller/package.json`,
`apps/controller/tsconfig.json`.

# Tests
- Vitest unit tests per schema file (valid + invalid cases) in both packages.
- `npm run typecheck`, `npm run lint`, `npm test` all green from repo root.

# Acceptance Criteria
- [ ] `packages/protocol` exports Zod schemas + inferred types for Project,
      ClaudeSession (with all 11 states), Task (with all 7 states), and the 13
      domain event types, plus the versioned WS envelope.
- [ ] `packages/config` loads and validates env vars matching `.env.example`,
      with sensible defaults and aggregated error messages on invalid input.
- [ ] No `any`/untyped escape hatches in either package.
- [ ] All tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- Getting the state/event enums wrong here is expensive later (every
  downstream page depends on them) — cross-checked directly against
  architecture/session-model.md and architecture/event-system.md before
  writing code, not re-derived from memory.
- Zod version pinning across packages must stay consistent to avoid duplicate
  `zod` instances causing `instanceof`/schema-identity issues — single version
  hoisted at the workspace root via npm workspaces' dedup.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page3.md` written (packages/logging) before starting page3
