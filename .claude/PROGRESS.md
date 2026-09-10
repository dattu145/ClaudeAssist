# Progress

**Current phase**: Phase 1
**Current page**: page17 (mobile foundation) — not started
**Completed pages**: page1 (project foundation & monorepo skeleton), page2
  (packages/protocol & packages/config), page3 (packages/logging), page4
  (controller foundation), page5 (session state machine + domain entities),
  page6 (Project Registry), page7 (ClaudeSessionAdapter interface +
  FakeClaudeSessionAdapter), page8 (ClaudeCodeAdapter — real implementation),
  page9 (Session Registry), page10 (event system + EventRepository),
  page11 (Task system), page12 (REST API completion), page13 (WebSocket
  API), page14 (pairing & auth), page15 (ProcessDiscoveryService), page16
  (startup reconciliation)
**Active work**: none
**Blocked work**: **git push access** — `dattu145/ClaudeAssist` push is
  still failing with 403 (the stored HTTPS credential is tied to a
  different GitHub account than the repo owner; changing `git config
  user.name` didn't fix it). Page10 through page16 commits (7 now) are
  sitting locally on `main`, unpushed. User needs to fix the stored HTTPS
  credential (or grant push access) before the next push.
**Known issues**: `npm install` reports 17 pre-existing vulnerabilities in
  transitive deps (mostly from the Expo scaffold + better-sqlite3's build
  chain) — not yet triaged; do not run `npm audit fix --force` without
  review, it can silently change majors.
**Next action**: write `.claude/plans/page17.md`, then implement it
**Last completed milestone**: page16 implemented and verified (2026-09-10)
  — startup reconciliation (`domain/reconciliation/reconciler.ts`), and
  `architecture/session-model.md`'s reconciliation section corrected to
  match reality: page8's real adapter testing proved sessions don't map to
  long-lived processes (no `--bg`), so the original "cross-reference
  against `claude agents --json`" design didn't apply — the actual fix is
  unconditionally disconnecting any persisted session in a mid-flight
  status (`STARTING`/`WORKING`/`WAITING_FOR_*`) on startup, since a fresh
  adapter instance can never still know about one. `claude agents --json`
  is still used, but for discovering *unmanaged* sessions (interactive
  terminals, matched to a registered project by `cwd`) as `DISCOVERED`
  records. `GET /health`'s `lastReconciliationAt` (a field that existed
  since page4 but was always `null`) now reflects the real value via a
  getter, not a static field frozen at app-construction time.

  Two real problems found and fixed through testing, not review: (1) the
  reconciler wastefully called `discoverSessions()` twice per run — fixed
  by sharing one result; (2) far more significantly, wiring the *real*
  `ClaudeCodeAdapter` + `ProcessDiscoveryService` into `lifecycle.test.ts`
  made every test spawn real subprocesses, and a real timing measurement
  showed a single `powershell.exe` invocation costs **~7 seconds of pure
  process-startup overhead on this machine** (confirmed with a trivial
  `Write-Output` call — not the cmdlet's fault). Since
  `ProcessDiscoveryService`'s cross-check is diagnostic-only and never
  drives session state (page15's own design), it was decoupled from the
  blocking reconciliation path entirely and now runs in the background
  after the server starts listening — measured real improvement:
  `startController()` resolves in ~2.5s instead of ~19-22s. Also made
  `startController`'s adapter/process-discovery/CLI-check dependencies
  injectable (`StartControllerOverrides`) so `lifecycle.test.ts` runs fast
  and deterministic (down from a 96s, partly-timing-out suite run to
  <3s) without losing real-integration coverage, which a fresh manual
  end-to-end run (pre-seeded stale session, real controller, real
  reconciliation) confirmed still works correctly. Verified: typecheck/
  lint clean, 298 default-suite tests passing across 51 files.
