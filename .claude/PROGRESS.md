# Progress

**Current phase**: Phase 1
**Current page**: page9 (Session Registry) — not started
**Completed pages**: page1 (project foundation & monorepo skeleton), page2
  (packages/protocol & packages/config), page3 (packages/logging), page4
  (controller foundation), page5 (session state machine + domain entities),
  page6 (Project Registry), page7 (ClaudeSessionAdapter interface +
  FakeClaudeSessionAdapter), page8 (ClaudeCodeAdapter — real implementation)
**Active work**: none
**Blocked work**: none
**Known issues**: `npm install` reports 17 pre-existing vulnerabilities in
  transitive deps (mostly from the Expo scaffold + better-sqlite3's build
  chain) — not yet triaged; do not run `npm audit fix --force` without
  review, it can silently change majors.
**Next action**: write `.claude/plans/page9.md`, then implement it
**Last completed milestone**: page8 implemented and verified (2026-09-09) —
  real `ClaudeCodeAdapter`, built only after probing the actual `claude` CLI
  live (with explicit user approval to spend a small amount of Claude
  usage), which overturned the original `--bg`-centric design in three
  concrete ways (see research/claude-code.md "CORRECTION (page8)"): `--bg`
  and `-p` are mutually exclusive, `--session-id` is ignored under `--bg`,
  and a `--bg` session can't be dispatched to via `-p --resume` until
  stopped. The adapter now uses plain resumable `-p --session-id`/`-p
  --resume` conversations exclusively — no `--bg`, no persistent process
  between dispatches. Outcome mapping (`permission_denials` ->
  `WAITING_FOR_PERMISSION`, `is_error` -> `FAILED`, else `COMPLETED`) is
  grounded in a real captured stream-json transcript, not assumption;
  `WAITING_FOR_INPUT` is documented as unreachable through this dispatch
  path. `discoverSessions`'s return type changed from `ClaudeSession[]` to
  a new `DiscoveredClaudeProcess` type (page7's signature turned out to be
  unimplementable by a real adapter — no `projectId` concept exists at the
  process level). A real correctness bug was caught by an actual test (not
  a review): `dispatch()` used a stale closure reference to the session,
  letting a completing dispatch clobber a concurrent `stopSession()`'s
  STOPPED transition — fixed by re-reading current state from the map
  before the final transition. A second real bug was caught by the opt-in
  real-CLI test suite: `spawn("claude.cmd", args)` without `shell: true`
  throws `EINVAL` on Windows (Node deliberately blocks direct `.cmd`
  spawning, a CVE-2024-27980 hardening fix) — fixed by using `shell: true`
  on Windows only, verified empirically (not assumed) that Node still
  quotes each array argument individually against an actual injection
  attempt before relying on it. Verified: typecheck/lint clean, 132
  default-suite tests passing across 27 files (2 opt-in real-CLI tests
  skipped by default), and those 2 real-CLI tests separately run and
  passing against the live `claude` CLI.
