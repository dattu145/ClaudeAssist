# Progress

**Current phase**: Phase 1
**Current page**: page13 (WebSocket API) — not started
**Completed pages**: page1 (project foundation & monorepo skeleton), page2
  (packages/protocol & packages/config), page3 (packages/logging), page4
  (controller foundation), page5 (session state machine + domain entities),
  page6 (Project Registry), page7 (ClaudeSessionAdapter interface +
  FakeClaudeSessionAdapter), page8 (ClaudeCodeAdapter — real implementation),
  page9 (Session Registry), page10 (event system + EventRepository),
  page11 (Task system), page12 (REST API completion)
**Active work**: none
**Blocked work**: **git push access** — `dattu145/ClaudeAssist` push is
  failing with 403 (cached credentials are for a different GitHub account,
  `leadsprogress`, which lacks push access). Page10, page11, and now page12
  commits are sitting locally on `main`, unpushed. User needs to fix
  credentials/repo access before the next push.
**Known issues**: `npm install` reports 17 pre-existing vulnerabilities in
  transitive deps (mostly from the Expo scaffold + better-sqlite3's build
  chain) — not yet triaged; do not run `npm audit fix --force` without
  review, it can silently change majors.
**Next action**: write `.claude/plans/page13.md`, then implement it
**Last completed milestone**: page12 implemented and verified (2026-09-09) —
  the full `/sessions*` REST surface: `POST/GET /sessions`, `GET /:id`,
  `GET /:id/events`, `GET /:id/tasks`, `POST /:id/instructions`,
  `POST /:id/resume`, `POST /:id/stop`, `POST /:id/cancel`. Closed a real
  gap found while wiring this page: `SessionRegistry.startSession`'s
  `initialInstruction` bypasses `TaskRegistry` entirely, so a session
  started with an initial instruction got no `Task` record — contradicting
  page11's whole point. Fixed at the HTTP boundary (not by changing either
  registry's tested contract): `POST /sessions` always starts the session
  without an instruction, then separately dispatches through `TaskRegistry`
  if one was given — verified by a test asserting the `Task` row exists.
  Added `TaskRegistry.cancelLatestTaskForSession` + `NoCancellableTaskError`
  (400) for `POST /:id/cancel`. Extracted a shared `buildTestApp` test
  fixture after the third HTTP test file needed the identical
  Fake-adapter-backed setup. Verified: typecheck/lint clean, 216
  default-suite tests passing across 39 files, and a real end-to-end
  manual run against the live controller (skipping the two routes that
  would spend real API usage through the now-wired `ClaudeCodeAdapter`,
  since dispatch logic is already covered by the automated suite).
