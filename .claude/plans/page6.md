# Page 6: Project Registry

# Objective
The first real business feature: register/list/inspect/update/remove
projects, backed by SQLite, exposed over `GET/POST /projects` and
`GET /projects/:id`. Establishes the domain/repository/API layering pattern
(entity -> repository interface -> SQLite impl -> registry service -> HTTP
routes) that page9 (Session Registry) and page11 (Task system) will repeat.

# Why
ARCHITECTURE.md's PROJECT REGISTRY section requires register/remove/update/
list/inspect operations with a stable internal id (never the name). This is
the first page that touches real persisted domain data, so it's also where
the domain error-handling pattern (ERROR HANDLING section:
`ProjectNotFoundError` etc.) and the HTTP error-mapping middleware get
established for every later route to reuse.

# Prerequisites
Page4 (controller foundation: SQLite bootstrap, migration runner, Express
app) and page5 (state-machine/entity pattern, `generateId`/`nowIso`) done.

# Implementation
1. `apps/controller/src/domain/errors.ts` — `DomainError` base class
   (`code: string`) and `ProjectNotFoundError extends DomainError` (`code:
   "PROJECT_NOT_FOUND"`). Other error types from the spec's ERROR HANDLING
   list are added when the page that needs them lands (page9, page11, ...),
   not speculatively now.
2. `apps/controller/src/domain/project/entity.ts` — `createProject(input: {
   name: string; path: string }): Project` (status `"active"`, id via
   `generateId("project")`, timestamps via `nowIso()`, validated against
   `ProjectSchema` before returning — same pattern as page5's
   `createSession`). Also `validateProjectPath(path: string): void` —
   throws a `DomainError` (`code: "INVALID_PROJECT_PATH"`) if the path
   doesn't exist or isn't a directory (spec's "detect project path", kept
   deliberately simple: existence + directory check, not a Claude-Code
   -specific probe).
3. `apps/controller/src/domain/project/repository.ts` — `ProjectRepository`
   interface: `create`, `findById`, `list`, `update`, `remove` (all
   `Promise`-returning, so a future non-SQLite implementation isn't
   constrained to be synchronous even though better-sqlite3 itself is sync).
4. `apps/controller/src/domain/project/registry.ts` — `ProjectRegistry`
   class wrapping a `ProjectRepository`: `registerProject(input)` (validates
   path, creates, persists, returns), `getProject(id)` (throws
   `ProjectNotFoundError` if missing), `listProjects()`, `updateProject(id,
   patch: Partial<Pick<Project, "name" | "path" | "status">>)`,
   `removeProject(id)`. Business rules (path validation, not-found) live
   here, not in the repository or the HTTP layer.
5. `apps/controller/src/db/migrations/0002_projects.sql` — `projects` table
   (id, name, path, status, created_at, updated_at).
6. `apps/controller/src/adapters/persistence/sqlite/project-repository.ts` —
   `SqliteProjectRepository implements ProjectRepository`, mapping
   snake_case columns to the camelCase `Project` shape, validating rows
   against `ProjectSchema` on read (defense against a schema/DB drift bug).
7. `apps/controller/src/api/http/projects.ts` — Express `Router`:
   `POST /` (body validated via `CreateProjectRequestSchema` from
   `packages/protocol`), `GET /` (list), `GET /:id` (inspect; 404 via the
   error-mapping middleware below).
8. `apps/controller/src/server.ts` — mount the projects router at
   `/projects`; `AppDeps` gains `projectRegistry: ProjectRegistry`; the
   existing generic error-handling middleware gains a first branch: a
   `DomainError` maps to a structured JSON body with an HTTP status derived
   from its `code` (404 for `*_NOT_FOUND`, 400 for `INVALID_*`, 500
   otherwise) instead of falling through to the generic 500.
9. `apps/controller/src/lifecycle.ts` — constructs the `SqliteProjectRepository`
   + `ProjectRegistry` and passes them into `createApp`.
10. Tests: entity (valid/invalid path), repository (against a real temp
    SQLite db with migrations applied — create/find/list/update/remove
    round-trip), registry (against a fake in-memory repository — not-found
    error, path validation delegation), API (supertest — 201/200/404/400
    cases, response bodies validated against `ProjectSchema`).

# Files Changed
New: `apps/controller/src/domain/errors.ts`,
`apps/controller/src/domain/project/{entity,repository,registry}.ts` (+
tests), `apps/controller/src/db/migrations/0002_projects.sql`,
`apps/controller/src/adapters/persistence/sqlite/project-repository.ts` (+
test), `apps/controller/src/api/http/projects.ts` (+ test). Modified:
`server.ts`, `lifecycle.ts`.

# Tests
Per above; `npm run typecheck`, `npm run lint`, `npm test` green from root.

# Acceptance Criteria
- [ ] `POST /projects` creates a project (rejects a nonexistent/non-directory
      path with 400), `GET /projects` lists, `GET /projects/:id` inspects
      (404 if missing).
- [ ] Project ids are server-generated (`project_<uuid>`), never derived
      from the name.
- [ ] `ProjectNotFoundError` (and the generic `DomainError` -> HTTP status
      mapping) is reusable by every later route, not projects-specific.
- [ ] Data survives a controller restart (SQLite-backed, verified by a
      repository test that closes and reopens the DB).
- [ ] All tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- `update`/`remove`/associate-with-sessions are only partially exercised
  here (no sessions exist yet until page9) — `remove` on a project with
  sessions is a page9-era concern (cascade or block?) and is explicitly
  deferred, not decided speculatively now.
- Keep the `DomainError` -> HTTP status mapping generic (code-prefix based)
  rather than a growing if/else per error class, so page9/page11 don't need
  to touch `server.ts`'s error handler again.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page7.md` written (FakeClaudeSessionAdapter +
      ClaudeSessionAdapter interface) before starting page7
