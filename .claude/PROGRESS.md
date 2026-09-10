# Progress

**Current phase**: Phase 1
**Current page**: page18 (mobile dashboard + real data) — implemented and
  verified
**Completed pages**: page1 (project foundation & monorepo skeleton), page2
  (packages/protocol & packages/config), page3 (packages/logging), page4
  (controller foundation), page5 (session state machine + domain entities),
  page6 (Project Registry), page7 (ClaudeSessionAdapter interface +
  FakeClaudeSessionAdapter), page8 (ClaudeCodeAdapter — real implementation),
  page9 (Session Registry), page10 (event system + EventRepository),
  page11 (Task system), page12 (REST API completion), page13 (WebSocket
  API), page14 (pairing & auth), page15 (ProcessDiscoveryService), page16
  (startup reconciliation), page17 (mobile foundation), page18 (mobile
  dashboard + real data)
**Active work**: none
**Blocked work**: **git push access** — `dattu145/ClaudeAssist` push is
  still failing with 403 (the stored HTTPS credential is tied to a
  different GitHub account than the repo owner; changing `git config
  user.name` didn't fix it). Page10 through page18 commits are sitting
  locally on `main`, unpushed. User needs to fix the stored HTTPS
  credential (or grant push access) before the next push.
**Known issues**: `npm install` reports ~20 pre-existing vulnerabilities in
  transitive deps (Expo scaffold + better-sqlite3 + expo-router's own
  deps) — not yet triaged; do not run `npm audit fix --force` without
  review, it can silently change majors.
**Next action**: write `.claude/plans/page19.md` (NotificationService), then
  implement it
**Last completed milestone**: page18 implemented and verified (2026-09-10) —
  replaced page17's placeholder mobile screens with real controller data and
  live WebSocket updates.

  While wiring the mobile app as the first real WS consumer, found that
  `attachWebSocketServer` (page13) attaches directly to the raw
  `http.Server`'s `upgrade` event, bypassing Express entirely — so page14's
  `createAuthMiddleware` never ran for WS connections. Any device on the LAN
  could connect to `/ws` and observe all session activity with no token.
  Fixed before building on it: `attachWebSocketServer` gained a
  `pairingRegistry` param and a `ws` `verifyClient` gate requiring
  `/ws?token=<token>` (a query param, since React Native's `WebSocket` can't
  send custom connect headers) validated via `PairingRegistry.verifyToken`;
  an invalid/missing token now gets the upgrade rejected (401) before an
  open socket ever exists. `server.test.ts` gained real `ws`-client tests
  for missing/invalid/valid tokens, backed by a real in-memory-SQLite
  `PairingRegistry` (not a mock).

  Built: `lib/api-client.ts` (typed REST client validating every request
  and response against `@claudeops/protocol` schemas — the controller is
  treated as a network peer, not trusted), `lib/use-live-events.ts` (WS
  hook with exponential-backoff reconnect and a bounded 100-event buffer,
  optional single-session subscribe), and six screens: Dashboard (real
  summary counts + live activity feed), Projects (list + create), Sessions
  (list + start), project detail (its sessions), session detail (status,
  live output, resume/stop/cancel/send-instruction actions, task history,
  live events). Root layout now pushes `project/[id]`, `project/new`,
  `session/[id]`, `session/new` as headered stack screens over the tab
  group.

  Verified: root `npm run typecheck`/`lint`/`test` green (301 tests, +9 WS
  tests including 3 new token-gate cases), mobile's own `tsc --noEmit`
  clean, `expo-doctor` 21/21, and a real Metro/Hermes bundle export (1137
  modules, no errors) as the closest thing to a boot check without a
  device/simulator. Also ran a real end-to-end manual check (`tsx` against
  a live `startController()` instance, not mocked): captured the real
  startup pairing code from the logger, exchanged it over
  `/pairing/exchange`, confirmed `/ws` rejects no-token and bad-token
  connections and accepts a valid one, created a project, started a
  session with an initial instruction, confirmed the WS client actually
  receives the live envelope for it, and confirmed `/projects` without a
  bearer token is rejected — the full path the mobile app itself takes,
  exercised for real, then discarded (scratch script, not committed).

  No device/simulator testing is possible in this environment — same
  documented limitation as page1/page17.

**Previous milestone**: page17 implemented and verified (2026-09-10)
  — turned the page1 Expo scaffold into a navigable app: `expo-router`
  file-based navigation, a pairing screen (the only thing an unpaired
  device can reach), `expo-secure-store`-backed token/URL storage, and a
  visible connection-state indicator (`ConnectionBadge`) polling
  `GET /health` on a bounded, unmount-cleared interval — no uncontrolled
  polling loop. `ConnectionProvider` gates the whole app: unpaired shows
  only `pairing.tsx`, paired reveals the `(tabs)` group (Dashboard,
  Projects, Sessions, Settings — placeholders, real data is page18).
  Settings has a working "forget this device" action. The pairing screen
  calls the real `POST /pairing/exchange` (page14) using
  `@claudeops/protocol`'s schemas directly (monorepo type-sharing, mobile
  importing the same types the controller defines).

  Installing `expo-router` and its peers surfaced a real monorepo
  dependency-hoisting bug: a transitive dep pulled in `react@19.3.0` at
  the workspace root while `apps/mobile` itself required the SDK-pinned
  `19.2.3`, producing two installed copies (`expo-doctor`'s duplicate-
  dependency check caught it). Fixed with a root `package.json`
  `overrides` entry pinning `react` workspace-wide — confirmed via a full
  clean reinstall (`rm -rf node_modules package-lock.json && npm
  install`) that only one `react` copy now exists. Verified: `expo-doctor`
  21/21, `tsc --noEmit` clean, root `npm run typecheck`/`lint`/`test`
  still green after the clean reinstall (298 tests), and a Metro bundler
  boot confirming the app compiles. No device/simulator testing is
  possible in this environment — documented limitation, same as page1.
