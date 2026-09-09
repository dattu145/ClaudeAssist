# Page 4: Controller Foundation

# Objective
Stand up the controller as a real long-running process: HTTP server with a
working `/health` endpoint, graceful shutdown (SIGINT/SIGTERM), and a SQLite
bootstrap + migration runner. No business routes (projects/sessions/tasks)
yet — those start at page6.

# Why
Every later controller page (registries, adapter, APIs, pairing) needs
somewhere to live. Building the skeleton — server lifecycle, DB bootstrap,
health/diagnostics — first, and getting graceful shutdown and startup right
before any business logic exists, avoids retrofitting reliability behavior
the spec explicitly requires (24/7 OPERATION, RECONNECT/RECOVERY sections)
onto a system already carrying real state.

# Prerequisites
Page1-3 done (workspace, protocol/config schemas, logging). `better-sqlite3`
and a migration tool chosen; a minimal HTTP framework chosen.

# Implementation
1. Add dependencies to `apps/controller`: `express` (simple, well understood,
   sufficient for Phase 1 — no need for Fastify's extra plumbing yet) +
   `@types/express`; `better-sqlite3` + `@types/better-sqlite3` for
   persistence; `zod` already available via `packages/protocol`/`config`.
2. `src/db/connection.ts` — opens the SQLite file at `config.DATA_DIR`
   (resolving `~` to the OS home dir), enables WAL mode (per RISKS.md — write
   contention mitigation) and foreign keys.
3. `src/db/migrate.ts` — a tiny hand-rolled migration runner: a
   `migrations` table tracking applied migration filenames, an ordered list
   of `.sql` files in `src/db/migrations/`, applied in a transaction on
   startup. (Deliberately not pulling in a full migration framework yet —
   Phase 1 has one table so far; revisit if migrations get complex.)
4. `src/db/migrations/0001_init.sql` — creates a `schema_meta` table only
   (id, applied_at) as the literal first migration, proving the runner works;
   real domain tables (projects, sessions, tasks, events, pairings) are added
   migration-by-migration starting page6/page9/page11/page14 alongside the
   repository that needs them, not speculatively now.
5. `src/health.ts` — `getHealth()` returns the `HealthResponseSchema` shape
   from `packages/protocol`: `dbReachable` (a trivial `SELECT 1`),
   `claudeCliReachable` (spawns `claude --version`, see
   research/claude-code.md, with a short timeout), `uptimeSeconds`,
   `lastReconciliationAt: null` (real value wired in page16).
6. `src/server.ts` — Express app: `GET /health` wired to `getHealth()`,
   validated response via `HealthResponseSchema.parse` before sending (fail
   loudly in dev if the shape drifts), JSON body parsing, a request-scoped
   logger (`requestId` via a small uuid, per OBSERVABILITY requirements) as
   Express middleware, a 404 handler, and a final error-handling middleware
   that logs structured errors and never leaks stack traces to the client.
7. `src/lifecycle.ts` — `startController()`: runs migrations, starts the
   HTTP server, returns a `stop()` function. `registerShutdownHandlers(stop)`
   wires `SIGINT`/`SIGTERM` to: stop accepting new connections, wait for
   in-flight requests (bounded timeout), close the DB, log shutdown, exit 0.
   Double-signal (impatient Ctrl+C) forces immediate exit with a warning
   logged.
8. `src/index.ts` — replaces the page1-3 scaffold proof-of-wiring with the
   real entrypoint: `loadConfig()` -> `createLogger()` -> `startController()`
   -> `registerShutdownHandlers()`.
9. Tests: migration runner applies `0001_init.sql` idempotently (running
   twice doesn't reapply), `getHealth()` against a real temp-file DB and a
   fake `claude`-version-check function, `/health` route integration test
   (supertest-style request against the Express app) asserting the response
   validates against `HealthResponseSchema`, graceful shutdown test (start,
   send stop, assert server no longer accepts connections and DB handle is
   closed).

# Files Changed
New: `apps/controller/src/{db/connection.ts, db/migrate.ts,
db/migrations/0001_init.sql, health.ts, server.ts, lifecycle.ts}` +
corresponding `.test.ts` files. Modified: `apps/controller/src/index.ts`,
`apps/controller/package.json`.

# Tests
Per above; `npm run typecheck`, `npm run lint`, `npm test` green from root.

# Acceptance Criteria
- [ ] `npm run --workspace apps/controller dev` starts the server, logs a
      structured startup line, and `GET /health` returns a
      `HealthResponseSchema`-valid JSON body.
- [ ] SQLite file is created at the configured `DATA_DIR` on first run;
      `migrations` table shows `0001_init.sql` applied; rerunning the process
      does not reapply it.
- [ ] SIGINT/SIGTERM cleanly stop the server and close the DB (verified by
      test, not just manual Ctrl+C).
- [ ] No business routes exist yet — this page is foundation only.
- [ ] All tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- `better-sqlite3` is a native module — first `npm install` on this Windows
  host may need build tools; if it fails, document the fallback (a pure-JS
  driver) rather than silently swapping without noting the tradeoff.
- Hand-rolled migration runner must stay genuinely simple (one responsibility:
  apply un-applied `.sql` files in order, in a transaction) — if Phase 1 ever
  needs down-migrations or branching, that's a sign to adopt a real tool
  instead of growing this one further.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page5.md` written (session state machine + domain
      entities) before starting page5
