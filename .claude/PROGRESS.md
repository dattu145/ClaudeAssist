# Progress

**Current phase**: Phase 1
**Current page**: page10 (event system + EventRepository) — not started
**Completed pages**: page1 (project foundation & monorepo skeleton), page2
  (packages/protocol & packages/config), page3 (packages/logging), page4
  (controller foundation), page5 (session state machine + domain entities),
  page6 (Project Registry), page7 (ClaudeSessionAdapter interface +
  FakeClaudeSessionAdapter), page8 (ClaudeCodeAdapter — real implementation),
  page9 (Session Registry)
**Active work**: none
**Blocked work**: none
**Known issues**: `npm install` reports 17 pre-existing vulnerabilities in
  transitive deps (mostly from the Expo scaffold + better-sqlite3's build
  chain) — not yet triaged; do not run `npm audit fix --force` without
  review, it can silently change majors.
**Next action**: write `.claude/plans/page10.md`, then implement it
**Last completed milestone**: page9 implemented and verified (2026-09-09) —
  `SessionRegistry` wraps a `ClaudeSessionAdapter` with SQLite persistence
  (`sessions` table, FK-blocks-delete against `projects` — deliberate,
  documented), status tracking, and event subscription, mirroring page6's
  entity/repository/registry pattern. `startSession` resolves and validates
  the project via `ProjectRegistry` (never orphans a session on an unknown
  project); `sendInstruction`/`resumeSession`/`stopSession` all delegate to
  the adapter then re-sync full state via a new `getSession` port method
  (added this page — `getStatus` alone wasn't enough for the registry to
  persist accurately; safe to amend, no other page depended on the old
  shape yet). A real integration test caught a genuine adapter bug before
  it shipped: `lastOutput`/`lastError`/`currentTask` were declared on the
  `ClaudeSession` schema since page2 but neither adapter ever actually
  populated them — only fired transient events. Fixed in both
  `FakeClaudeSessionAdapter` and `ClaudeCodeAdapter` so dispatch results are
  now genuinely persisted, not just observed live. Verified: typecheck/lint
  clean, 149 default-suite tests passing across 29 files, and the 2 opt-in
  real-CLI tests re-run and still passing against the live CLI after the
  adapter changes.
