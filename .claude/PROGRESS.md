# Progress

**Current phase**: Phase 1
**Current page**: page8 (ClaudeCodeAdapter — the real implementation) — not started
**Completed pages**: page1 (project foundation & monorepo skeleton), page2
  (packages/protocol & packages/config), page3 (packages/logging), page4
  (controller foundation), page5 (session state machine + domain entities),
  page6 (Project Registry), page7 (ClaudeSessionAdapter interface +
  FakeClaudeSessionAdapter)
**Active work**: none
**Blocked work**: none
**Known issues**: `npm install` reports 17 pre-existing vulnerabilities in
  transitive deps (mostly from the Expo scaffold + better-sqlite3's build
  chain) — not yet triaged; do not run `npm audit fix --force` without
  review, it can silently change majors.
**Next action**: write `.claude/plans/page8.md`, then implement it
**Last completed milestone**: page7 implemented and verified (2026-09-09) —
  `ClaudeSessionAdapter` port defined (`domain/session/adapter.ts`:
  discoverSessions/startSession/sendInstruction/resumeSession/stopSession/
  getStatus/subscribe), adapted from the spec's conceptual interface with
  one deliberate, documented addition (`projectPath` on
  `StartSessionInput`, needed by the real adapter's spawn cwd). Shipped
  `FakeClaudeSessionAdapter` — drives sessions through the real page5 state
  machine (never invents its own transitions), scriptable via
  `queueInstructionOutcome` for waiting/permission/failure scenarios, with
  a synchronous per-session event subscription model. Added
  `SessionNotFoundError` to the shared `DomainError` hierarchy. This
  unblocks page9+ (Session Registry, APIs) to be built and tested without
  ever shelling out to the real `claude` CLI. Verified: typecheck/lint
  clean, 110 tests passing across 24 files.
