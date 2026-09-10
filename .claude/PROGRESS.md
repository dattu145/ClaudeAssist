# Progress

**Current phase**: Phase 1
**Current page**: page21 (24/7 hardening & reliability pass) —
  implemented and verified. **Phase 1 is complete** — see the close-out
  section below.
**Completed pages**: page1 (project foundation & monorepo skeleton), page2
  (packages/protocol & packages/config), page3 (packages/logging), page4
  (controller foundation), page5 (session state machine + domain entities),
  page6 (Project Registry), page7 (ClaudeSessionAdapter interface +
  FakeClaudeSessionAdapter), page8 (ClaudeCodeAdapter — real implementation),
  page9 (Session Registry), page10 (event system + EventRepository),
  page11 (Task system), page12 (REST API completion), page13 (WebSocket
  API), page14 (pairing & auth), page15 (ProcessDiscoveryService), page16
  (startup reconciliation), page17 (mobile foundation), page18 (mobile
  dashboard + real data), page19 (NotificationService + domain-event
  wiring), page20 (CommandRouter/IntentResolver interfaces), page21 (24/7
  hardening & reliability pass)
**Active work**: none — Phase 1 roadmap is closed (no page22)
**Blocked work**: **git push access** — `dattu145/ClaudeAssist` push is
  still failing with 403 (the stored HTTPS credential is tied to a
  different GitHub account than the repo owner; changing `git config
  user.name` didn't fix it). Page10 through page21 commits are sitting
  locally on `main`, unpushed. User needs to fix the stored HTTPS
  credential (or grant push access) before the next push.
**Known issues**: `npm install` reports ~20 pre-existing vulnerabilities in
  transitive deps (Expo scaffold + better-sqlite3 + expo-router's own
  deps) — not yet triaged; do not run `npm audit fix --force` without
  review, it can silently change majors. See also the Phase 1 close-out's
  documented limitations below.
**Next action**: none from this roadmap — Phase 1 is done. Next steps are
  either fixing git push access, or scoping Phase 2 (voice/Bordio/
  WhatsApp/multi-user — all explicitly out of Phase 1) whenever the user
  wants to start that.

## Phase 1 close-out

Checked against what's persisted in `.claude/` — `ARCHITECTURE.md`,
`SECURITY.md`, `RISKS.md`, `TEST_PLAN.md` — as the practical stand-in for
the original spec's Phase 1 Acceptance Criteria checklist, which isn't
saved verbatim anywhere in this repo (the user confirmed this substitution
during page21).

**Delivered, matching `ARCHITECTURE.md`'s component map:**
- Controller: modular monolith (Express + `ws`, one process, one port),
  SQLite behind repository interfaces, structured JSON logging with
  optional rotating file output (page21).
- Domain layer: Project/Session/Task registries, formal state machines
  for both Session and Task (`packages/protocol`), event bus +
  `EventRepository` + WS broadcast + `NotificationService` (all three
  named subscribers from `architecture/event-system.md`), startup
  reconciliation (page16), `CommandRouter`/`IntentResolver` scaffolding
  (page20, ADR-005) — actually wired into the four mutating session
  routes, not left inert.
- `ClaudeCodeAdapter`: real Claude Code CLI integration per the corrected
  design in `research/claude-code.md` (plain `-p --session-id`/`-p
  --resume`, never `--bg`), behind the same `ClaudeSessionAdapter`
  interface `FakeClaudeSessionAdapter` implements — the whole test suite
  never depends on real Claude Code or network access except the
  explicitly opt-in `claude-code-adapter.real.test.ts`.
- `ProcessDiscoveryService`: Windows implementation verified against this
  machine's real process list; POSIX implementation built but genuinely
  unverified (documented in `RISKS.md` since page15).
- Security (`SECURITY.md`): pairing codes + hashed bearer tokens, every
  route but `/health` and `/pairing/*` authenticated — including the WS
  `/ws` endpoint, where a real gap (Express auth middleware never running
  for WS connections) was found and fixed during page18, before mobile
  shipped against it. `--dangerously-skip-permissions` is never a
  default anywhere in this codebase.
- Mobile: Expo/React Native app, pairing screen, real dashboard/projects/
  sessions/session-detail screens wired to the real controller over REST
  + a reconnecting WS live-events stream (page17/18) — no placeholder
  screens remain.
- Reliability (this page): bounded-memory audit (two findings
  documented, not silently ignored — see `RISKS.md`), log rotation
  implemented and verified against real files on real disk, and a
  full-stack recovery test (`recovery.test.ts`) proving the documented
  reconciliation algorithm end-to-end across two real controller
  instances sharing one on-disk database — closing the `TEST_PLAN.md`
  "Recovery" layer gap that had existed since page1's test plan was
  written.
- 335 tests passing across the monorepo (2 opt-in real-CLI tests
  intentionally skipped by default), typecheck and lint clean on both
  workspaces at every page.

**Explicitly out of scope for Phase 1 (per `ARCHITECTURE.md`'s
non-goals — not gaps, deliberate boundaries):** voice, Bordio, WhatsApp,
multi-user permissions, LLM-driven `IntentResolver`, attaching to
manually-started interactive sessions, Postgres migration, microservices.

**Known, documented limitations carried forward (not blockers):**
- `ProcessDiscoveryService`'s POSIX path is unit-tested against fixture
  output only — unverified on real macOS/Linux.
- `ClaudeCodeAdapter`'s in-memory session maps grow for the life of the
  daemon with no eviction (bounded by realistic single-user usage, not by
  code — see `RISKS.md`, found during this page).
- `DISCOVERY_POLL_INTERVAL_MS` is defined but unused — no periodic
  re-discovery, only startup-time reconciliation (found during this
  page, documented as a Phase 2 candidate).
- No device/simulator testing of the mobile app anywhere in this
  project — verified via `expo-doctor`, `tsc --noEmit`, and real Metro
  bundle exports throughout, never an actual tap-through.
- `npm audit`'s ~20 transitive-dependency findings remain untriaged.
- Mobile app only works on the LAN (no tunnel/remote access) — explicit
  Phase 1 non-goal, not a bug.

**The one item genuinely outside my control:** git push access
(`leadsprogress` account lacks push rights to `dattu145/ClaudeAssist`).
Pages 10-21 (12 pages, dozens of commits) are complete, tested, and
committed locally on `main`, waiting to be pushed once the user fixes
the stored credential or grants access.

**Previous milestone**: page20 implemented and verified (2026-09-10)
  — the typed command surface ADR-005 requires. Added `domain/command/
  types.ts` (the `Command` discriminated union: `SEND_INSTRUCTION`,
  `RESUME_SESSION`, `STOP_SESSION`, `CANCEL_TASK` — the mutating
  session-level operations ADR-005 names as the cross-source surface,
  scoped deliberately narrower than every REST endpoint; `StartSession`/
  `CreateProject` stayed direct REST calls, documented as a scope decision
  rather than made silently), `domain/command/router.ts`
  (`CommandRouter.dispatch()` — a typed routing layer over the
  already-tested registry methods, no new business logic), and
  `domain/command/intent-resolver.ts` (the `IntentResolver` interface
  only, per ADR-005's explicit "no LLM-backed implementation ships in
  Phase 1"). Landed under `domain/command/`, matching the precedent
  reconciliation already set of landing under `domain/` rather than
  `ARCHITECTURE.md`'s sketched `orchestration/` tree.

  Actually wired in, not left inert: `api/http/sessions.ts`'s four
  mutating routes (`/instructions`, `/resume`, `/stop`, `/cancel`) now
  build a `Command` and call `commandRouter.dispatch()` instead of
  calling the registries directly — proving the abstraction against
  today's only real command source (mobile via REST) before voice ever
  needs it, per the roadmap's own framing of this page.

  Verified: 326 tests passing (+4 new `CommandRouter` tests), and —
  critically — all 15 pre-existing `sessions.test.ts` cases for these
  four routes passed unchanged, proof the reroute didn't shift observable
  behavior. Typecheck/lint clean. Real end-to-end manual check (`tsx`
  against a live `startController()`, not mocked): drove a real session
  through all four `CommandRouter` paths over actual HTTP — send an
  instruction, resume, stop, and cancel a task — confirming each still
  produces the correct result through the new dispatch path.

**Previous milestone**: page19 implemented and verified (2026-09-10)
  — the third `EventBus` subscriber named in `architecture/event-system.md`
  (alongside `EventRepository` and the WS API), closing a documented gap
  since page10. Added `domain/notification/service.ts` (the
  `NotificationService` interface — Phase 1 draws it now so a future push/
  WhatsApp/voice notifier is a new adapter, not a rewrite, per ADR-002),
  `domain/notification/should-notify.ts` (a pure function classifying
  every `DomainEventType`: `SESSION_COMPLETED`/`FAILED`/
  `WAITING_FOR_INPUT`/`WAITING_FOR_PERMISSION`/`ERROR` are notify-worthy —
  the first four are `event-system.md`'s own examples, `SESSION_ERROR` was
  added as the same "something needs you" bucket as `FAILED` — everything
  else is purely informational and already reaches mobile live over WS),
  `adapters/notification/console-notification-service.ts` (Phase 1's only
  implementation — logs through the same structured JSON stdout as
  everything else, tagged `notification: true` for filterability), and
  `domain/notification/wire-notifications.ts` (bus subscriber, same
  fire-and-forget-with-logged-failure shape as page10's
  `wireEventPersistence` — a `notify()` rejection can't crash the bus or
  block the other subscribers). Wired live in `lifecycle.ts`.

  Verified: 322 tests passing (+21 new: 15 `shouldNotify` cases covering
  every event type, 2 `ConsoleNotificationService`, 4 `wireNotifications`),
  typecheck/lint clean. Real end-to-end manual check (`tsx` against a live
  `startController()`, not mocked): drove one session to `SESSION_
  COMPLETED` (default fake-adapter outcome) and a second to `SESSION_
  FAILED` (via `FakeClaudeSessionAdapter.queueInstructionOutcome`),
  confirmed a real `notification: true` log line fired for each, and that
  the sessions' `SESSION_OUTPUT` events (purely informational) produced
  none — then discarded the scratch script, not committed.

**Previous milestone**: page18 implemented and verified (2026-09-10) —
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
