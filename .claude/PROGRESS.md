# Progress

**Current phase**: Phase 2 (Bordio integration) — **complete**. Phase 1
  also complete. See both close-out sections below.
**Current page**: pageB5 (Phase 2 hardening pass) — implemented and
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
  dashboard + real data), page19 (NotificationService + domain-event
  wiring), page20 (CommandRouter/IntentResolver interfaces), page21 (24/7
  hardening & reliability pass) — **Phase 1 complete**. pageB1 (BordioClient
  adapter + FakeBordioClient), pageB2 (Bordio ID mapping persistence),
  pageB3 (BordioNotificationService, outbound), pageB4 (inbound Bordio
  command polling), pageB5 (Phase 2 hardening pass) — **Phase 2 complete**.
**Active work**: none — both roadmaps are closed (no page22, no pageB6)
**Blocked work**: **git push access** — `dattu145/ClaudeAssist` push is
  still failing with 403 (the stored HTTPS credential is tied to a
  different GitHub account than the repo owner; changing `git config
  user.name` didn't fix it). Page10 through pageB5 commits are sitting
  locally on `main`, unpushed. User needs to fix the stored HTTPS
  credential (or grant push access) before the next push.
**Known issues**: `npm install` reports ~20 pre-existing vulnerabilities in
  transitive deps (Expo scaffold + better-sqlite3 + expo-router's own
  deps) — not yet triaged; do not run `npm audit fix --force` without
  review, it can silently change majors. See also both close-out sections'
  documented limitations below. No real `BORDIO_API_KEY`/workspace is
  available in this environment — `bordio-client.real.test.ts` is written
  but has not been run for real anywhere yet; every part of the Bordio
  integration has only been verified against `FakeBordioClient`, never a
  real Bordio workspace. pageB4's inbound commands only work on Bordio
  tasks pageB3 already linked to a session — starting a brand-new session
  purely from Bordio isn't supported. A core (non-Bordio) gap found during
  pageB5's audit: a session marked `DISCONNECTED` by startup reconciliation
  currently cannot actually be resumed (`RISKS.md` — the adapter has no
  way to reconstruct its in-memory record on a resume call, only on
  `startSession`) — pre-existing since page7/page16, not introduced by
  Phase 2, not fixed here (out of scope for a Bordio hardening pass).
**Next action**: none from either roadmap — Phase 1 and Phase 2 are both
  done. Real next steps: fix git push access, get a real Bordio API
  key/workspace to verify the integration for real, fix the
  session-resume-after-restart gap `RISKS.md` documents, or scope Phase 3
  (voice, per research/voice.md's own numbering) whenever the user is
  ready.

## Phase 2 close-out

Checked against this phase's own proposal — `research/bordio.md`,
`decisions/ADR-006.md`, and pageB1-B5's acceptance criteria — since
Phase 2 (unlike Phase 1) has no external spec to compare against; the
proposal I wrote and the user approved *is* the checklist.

**Delivered:**
- `BordioClient` port + `FakeBordioClient` (pageB1), fake-before-real
  like every adapter since page7 — the default test suite never depends
  on real Bordio access. Real `BordioApiClient` handles auth, retry/
  backoff (429/500, bounded), idempotency keys, conditional GETs, and
  never logs the API key.
- `bordio_links` (session <-> Bordio task) and `bordio_poll_cursors`
  (ETag-based poll state) persistence (pageB2), same repository-
  interface pattern every other piece of this project's persistence
  uses.
- Outbound sync (pageB3): notify-worthy session events mirror onto a
  Bordio task per session, idempotency-keyed, auto-discovering a
  default open/closed status so it works with just `BORDIO_API_KEY` set.
- Inbound polling (pageB4): a user can reply to a linked Bordio task to
  send an instruction back to ClaudeOps, through the same `CommandRouter`
  page20 built for exactly this ("proving the abstraction before voice
  ever needs it" — and here it is, proven).
- Hardening (pageB5): bounded-memory/critical-path-blocking audit (clean
  — confirmed, not assumed), a real cross-restart recovery test for the
  `bordio_links` mapping table, and a genuinely new finding along the
  way (the session-resume-after-restart gap, documented above and in
  `RISKS.md`, correctly scoped as pre-existing/out-of-scope rather than
  silently fixed or silently ignored).
- 392 tests passing across the monorepo, typecheck/lint clean at every
  page.

**Explicitly out of scope for Phase 2** (per the approved proposal, not
gaps): starting a brand-new session purely from Bordio (only replying to
an already-linked task is supported); WhatsApp, voice, multi-user — all
still Phase 1's original non-goals, untouched by this phase.

**Known limitations carried forward:**
- No real Bordio workspace/key available anywhere in this environment —
  every layer is verified against `FakeBordioClient` only.
- The session-resume-after-restart gap (see above) — real, pre-existing,
  not Bordio-specific, not fixed in this phase.
- `BordioInboundPoller.pollOnce()` only processes one page of
  command-tagged tasks per tick (self-correcting, not broken, but
  throughput-bounded under a large backlog).

**The one item genuinely outside my control:** git push access — pages
10 through pageB5 (17 pages, dozens of commits) are complete, tested,
and committed locally on `main`, waiting to be pushed once the stored
credential issue is resolved.

**Last completed milestone**: pageB5 implemented and verified
(2026-09-10) — the final Phase 2 page, same shape as page21: a pass over
pageB1-B4, not a new feature. Bounded-memory audit of `BordioApiClient`/
`BordioNotificationService`/`BordioInboundPoller` found nothing new to
flag — none hold per-session/per-task in-memory state, unlike page21's
`ClaudeCodeAdapter` finding — confirmed by reading, not assumed. Also
confirmed `InProcessEventBus.publish()` never awaits a subscriber's async
work, so `BordioApiClient`'s retry/backoff can never block a session
dispatch or HTTP request. Found one real (documented, not fixed) limit:
`BordioInboundPoller.pollOnce()` doesn't follow `nextCursor`, so a large
backlog drains one page per poll tick rather than all at once —
self-correcting, not broken.

Closed the actual gap the roadmap named — "recovery behavior for the
mapping table across restarts" — with `bordio-recovery.test.ts`: two
real SQLite connections over the same on-disk database (instance A
writes a `bordio_links` row via `BordioNotificationService.notify()`,
closes; instance B reopens the same file with a fresh
`FakeBordioClient`, seeded via a new `seedTask()` test hook to stand in
for "the real Bordio task still exists remotely," and calls `notify()`
again) proving the link survives and gets reused — the existing task is
updated, not duplicated. While designing this test, found and documented
a real pre-existing gap unrelated to Bordio: `SessionRegistry.
resumeSession`/`sendInstruction`/`stopSession` all call straight through
to the adapter, which has no way to reconstruct its in-memory record
after a restart — meaning a session reconciliation marks `DISCONNECTED`
currently cannot actually be resumed. Routed the recovery test around
this (testing `bordio_links` recovery directly rather than through a
full HTTP session-resume flow) rather than silently building on a broken
assumption; documented in `RISKS.md` as pre-existing, out of scope for
this Bordio-focused page.

Finalized `RISKS.md` (three new rows: the resume-after-restart gap, the
pagination limitation, and the audit's clean-bill-of-health entries) and
`SECURITY.md` (the pageB3-era "proposed" language on `BORDIO_API_KEY`
updated to reflect the actual implemented, verified-safe state). Verified:
392 tests passing (+1 new), typecheck/lint clean. No real Bordio
workspace available — same carried-forward limitation as every prior
Phase 2 page. **Phase 2 is complete.**

**Previous milestone**: pageB4 implemented and verified
(2026-09-10) — the other direction ADR-006 named: a Bordio task can
trigger a ClaudeOps command. Since Bordio has no webhooks, this is a
bounded, backed-off poller (`domain/bordio/inbound-poller.ts`'s
`BordioInboundPoller`), same spirit as `ProcessDiscoveryService`'s
cross-check. Design decision worth calling out: rather than inventing a
text convention to identify which session a brand-new Bordio task
targets (this project's minimal `BordioTask` shape has no custom-field
support), the poller only acts on tasks **already linked** by pageB3 —
i.e. the "Session needs input" card the user already sees. The user
replies by editing that card's title and applying a configured command
tag; the poller finds it via `bordio_links.findByBordioTaskId`,
dispatches `SEND_INSTRUCTION` through the existing `CommandRouter`
(page20 — not `IntentResolver`, per ADR-006, since Bordio tasks are
structured data), and removes the tag afterward so it isn't
redispatched. Starting a brand-new session purely from Bordio is out of
scope, documented as a real limitation, not an oversight. Poll mechanics
reuse pageB2's `bordio_poll_cursors` (ETag-based, so an unchanged poll
short-circuits on a real `304`). `UpdateBordioTaskInput` (pageB1) gained
`tagIds?` to support the untagging step. Config: `BORDIO_COMMAND_TAG_ID`
(required for the poller to start — opaque per-workspace, no
auto-discovery possible) and `BORDIO_POLL_INTERVAL_MS` (default 60s;
actually wired to something, unlike page21's documented dead
`DISCOVERY_POLL_INTERVAL_MS`). Wired into `lifecycle.ts`, started only
when both `BORDIO_API_KEY` and `BORDIO_COMMAND_TAG_ID` are set;
`Controller` gained a test-only `pollBordioInboundCommandsNow` escape
hatch (matching `db` already being exposed for test introspection) to
force one poll tick instead of waiting a real interval. Verified: 391
tests passing (+9 new), including two permanent `lifecycle.test.ts`
integration cases that drive a real session to `WAITING_FOR_INPUT`
(letting pageB3's outbound sync create the real link), simulate the
user's reply via `FakeBordioClient`, force a poll, and confirm the
session actually received the instruction over real HTTP. Typecheck/
lint clean. No real Bordio workspace available — same carried-forward
limitation as every prior Phase 2 page.

**Previous milestone**: pageB3 implemented and verified
(2026-09-10) — the first Phase 2 page that's actually visible to the
user: session status now mirrors onto a Bordio task board.
`domain/bordio/session-to-bordio-state.ts` maps the five notify-worthy
event types to Bordio's universal `open`/`closed` state (the only status
signal that means the same thing in every workspace, per
`research/bordio.md`). `adapters/bordio/bordio-notification-service.ts`
(`BordioNotificationService implements NotificationService`, page19's
interface) creates one Bordio task per session on its first notify-worthy
event (idempotency-keyed off the session id) and updates that same
task's title/status on every subsequent one, using pageB2's
`bordio_links` mapping to find it — auto-discovering a default
open/closed `task_status_id` via `listTaskStatusDefinitions()` (cached
after the first call) when `BORDIO_OPEN_STATUS_ID`/
`BORDIO_CLOSED_STATUS_ID` aren't explicitly configured. Wired into
`lifecycle.ts` alongside `ConsoleNotificationService` — both subscribe
independently to the bus — but only when `BORDIO_API_KEY` is set
(`packages/config` gained the three new vars); fully inert otherwise,
verified by a real lifecycle-level test, not just by code review.
`StartControllerOverrides` gained an injectable `bordioClient` so tests
substitute `FakeBordioClient` instead of real network access even with
`BORDIO_API_KEY` set. Verified: 382 tests passing (+21 new, including
two permanent `lifecycle.test.ts` integration cases — a real
`startController()`, real HTTP calls, and assertions against both the
fake client and the real SQLite `bordio_links` table — kept in the
suite rather than a throwaway manual-check script, since they exercise
exactly the scenario a scratch script would have). Typecheck/lint clean.
No real Bordio workspace available in this environment — outbound sync
is verified against `FakeBordioClient` only, documented as the same
carried-forward limitation as pageB1/pageB2.

**Previous milestone**: pageB2 implemented and verified
(2026-09-10) — persistence for the two pieces of state pageB3/pageB4
both need. `db/migrations/0007_bordio.sql` adds `bordio_links` (a
generic `(claudeops_entity_type, claudeops_entity_id) -> bordio_task_id`
mapping, unique-indexed so a second `upsert` for the same entity updates
rather than duplicates) and `bordio_poll_cursors` (named cursor rows —
ETag + timestamp — for the inbound poller to short-circuit an unchanged
poll via a real 304, deliberately not a full per-task snapshot yet,
since that shape depends on pageB4's diff algorithm, not decided until
that page). Mapping granularity is session-level, not task-level:
`shouldNotify` (page19) only recognizes session-scoped events, so one
Bordio task tracks one ClaudeOps session's lifecycle, not one per `Task`
(which would flood a Bordio board with a card per instruction).
`domain/bordio/{link,link-repository,poll-cursor,poll-cursor-
repository}.ts` define the entities/interfaces; `adapters/persistence/
sqlite/{bordio-link-repository,bordio-poll-cursor-repository}.ts`
implement them, same row-mapping pattern every other SQLite repository
in this codebase uses. Verified: 367 tests passing (+9 new), typecheck/
lint clean. No lifecycle-level manual check — standalone persistence,
not wired into a running controller yet (pageB3's job), same as pageB1.

**Previous milestone**: pageB1 implemented and verified
(2026-09-10) — the first Phase 2 page. `domain/bordio/client.ts` defines
the `BordioClient` port (`listTasks`/`createTask`/`updateTask`/
`listTaskStatusDefinitions`), matching the real API surface researched
directly from Bordio's own docs (`research/bordio.md`). Built
fake-before-real, same precedent as page7/page8:
`adapters/bordio/fake-bordio-client.ts` is deterministic and enforces the
same idempotency-key replay/conflict semantics real Bordio documents;
`adapters/bordio/bordio-client.ts` (`BordioApiClient`) is the real
`fetch`-based implementation — retries `429` (honoring `Retry-After`) and
`500` with bounded exponential backoff, never retries other 4xx, warns
(never throws) when `RateLimit-Remaining` runs low, and never logs the
raw API key (verified by test, not just claimed). An opt-in
`bordio-client.real.test.ts` exists for a real workspace/key, mirroring
`claude-code-adapter.real.test.ts`'s pattern — not run here (no real
Bordio credentials in this environment), documented as the same accepted
limitation the real-CLI suite has always had. Not wired into
`lifecycle.ts` yet — standalone, like page7, until pageB3 needs it.
Verified: 358 tests passing (+25 new), typecheck/lint clean. No
lifecycle-level manual check for this page (nothing is wired into a
running controller yet) — verification is the unit-level fake/mocked-
fetch suite itself, matching the scope pageB1.md set out.

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
