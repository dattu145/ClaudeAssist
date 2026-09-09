# Page 3: packages/logging

# Objective
Structured JSON logging shared by the controller (and later, any process it
spawns/manages) with the context fields the spec requires
(timestamp, level, component, event, projectId, sessionId, taskId,
requestId), plus documented log rotation. No server/HTTP code yet.

# Why
ARCHITECTURE.md/OBSERVABILITY section requires structured logs with
consistent context and forbids logging secrets. Building this before page4
(controller foundation) means the HTTP/WS/adapter code that lands starting
page4 is written against a real logger from day one instead of `console.log`
calls that get retrofitted later — the same reasoning as page2 for
protocol/config.

# Prerequisites
Page1 (workspace skeleton) and page2 (packages/config, for LOG_LEVEL) done.

# Implementation
1. `packages/logging/src/types.ts` — `LogLevel` union (`debug|info|warn|error`,
   reuses the same values as `ConfigSchema.LOG_LEVEL` from packages/config so
   they can't drift — imported, not redefined), `LogContext` interface
   (`component: string` required; `event?`, `projectId?`, `sessionId?`,
   `taskId?`, `requestId?` optional; arbitrary extra fields allowed via index
   signature for one-off context, still typed as `unknown` not `any`).
2. `packages/logging/src/redact.ts` — a small denylist-based redactor: keys
   matching `/token|secret|key|password|credential/i` anywhere in a logged
   object get their value replaced with `"[REDACTED]"` before serialization.
   Applied unconditionally inside the logger, not opt-in, so a future
   forgetful call site can't accidentally leak a secret.
3. `packages/logging/src/logger.ts` — `createLogger(baseContext: { component:
   string })` returns a `Logger` with `debug/info/warn/error(message, context?)`
   methods. Each call:
   - merges `baseContext` + call-site `context`
   - stamps `timestamp` (ISO-8601 UTC) and `level`
   - runs the merged object through `redact.ts`
   - writes one JSON line to stdout (`process.stdout.write(JSON.stringify(...) +
     "\n")`), filtered by the configured minimum level
   - also supports a `.child(context)` method returning a logger with that
     context pre-merged (e.g. `logger.child({ sessionId })`), since most
     controller code will want a scoped logger rather than repeating ids.
4. `packages/logging/src/rotation.md` — short doc (not code): Phase 1 does
   not hand-roll log rotation. It documents the recommended approach (pipe
   controller stdout through an OS-appropriate rotator — e.g. `rotating-file-
   stream` if writing to a file directly, or the platform's own service
   manager/log rotation when run under one) and defers picking a concrete
   mechanism to page21 (24/7 hardening pass) when the controller's actual
   run-as-daemon setup is decided. Reasoning: rotation strategy depends on
   how the daemon is actually deployed (page21), which isn't decided yet —
   documenting the constraint now and picking the mechanism later avoids
   guessing.
5. `packages/logging/src/index.ts` — re-exports `createLogger`, types.
6. Tests: level filtering (e.g. a `warn`-level logger drops `.debug()` calls),
   context merging (base + call-site + child), redaction (a key named
   `apiToken` or `password` is redacted; an unrelated key is not touched,
   including nested objects), valid JSON-line output format.

# Files Changed
New: `packages/logging/*`. Modified: root `tsconfig.json` (add reference),
`apps/controller/package.json` + `tsconfig.json` (add dependency), replace
the `console.log` in `apps/controller/src/index.ts` with `createLogger`.

# Tests
- Vitest unit tests per above.
- `npm run typecheck`, `npm run lint`, `npm test` green from repo root.

# Acceptance Criteria
- [ ] `createLogger({ component })` produces valid single-line JSON per log
      call with `timestamp`, `level`, `component`, and merged context.
- [ ] Level filtering works (messages below configured minimum are dropped).
- [ ] Redaction is unconditional and covers nested objects, verified by test.
- [ ] `LogLevel` is imported from `packages/config`, not redefined, so the
      two can't drift.
- [ ] `apps/controller/src/index.ts` uses the real logger instead of
      `console.log`.
- [ ] All tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- Over-building here (e.g. adding file transports, external log shippers) is
  explicitly out of scope — stdout-only JSON lines is correct for Phase 1;
  a process supervisor or the OS handles capture/rotation per rotation.md.
- Redaction is denylist-based and therefore imperfect (a secret in an
  unexpectedly-named field could slip through) — documented as a known
  limitation in SECURITY.md rather than over-engineered into a false sense of
  completeness.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page4.md` written (controller foundation) before starting page4
