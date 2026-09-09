# Progress

**Current phase**: Phase 1
**Current page**: page7 (FakeClaudeSessionAdapter + ClaudeSessionAdapter
  interface) — not started
**Completed pages**: page1 (project foundation & monorepo skeleton), page2
  (packages/protocol & packages/config), page3 (packages/logging), page4
  (controller foundation), page5 (session state machine + domain entities),
  page6 (Project Registry)
**Active work**: none
**Blocked work**: none
**Known issues**: `npm install` reports 17 pre-existing vulnerabilities in
  transitive deps (mostly from the Expo scaffold + better-sqlite3's build
  chain) — not yet triaged; do not run `npm audit fix --force` without
  review, it can silently change majors.
**Next action**: write `.claude/plans/page7.md`, then implement it
**Last completed milestone**: page6 implemented and verified (2026-09-09) —
  first real business feature. `POST/GET /projects` and `GET /projects/:id`
  backed by `SqliteProjectRepository`, wrapped by `ProjectRegistry` (path
  validation via `validateProjectPath`, `ProjectNotFoundError` on a missing
  id). Established the reusable layering pattern (entity -> repository
  interface -> SQLite impl -> registry service -> HTTP routes) and a
  generic `DomainError` -> HTTP status mapping (`*_NOT_FOUND` -> 404,
  `INVALID_*` -> 400) in `server.ts` that page9/page11 reuse without
  touching the HTTP layer again. Verified: typecheck/lint clean, 98 tests
  passing across 23 files, and a manual end-to-end run against the real
  HTTP server confirming create/list/inspect/404/400 all behave correctly.
