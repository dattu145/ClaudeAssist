# Page B3: BordioNotificationService (outbound sync)

# Objective
The first Phase 2 page that's actually visible to the user: a
`BordioNotificationService implements NotificationService` (page19's
interface) that mirrors notify-worthy session events
(`SESSION_COMPLETED`/`FAILED`/`WAITING_FOR_INPUT`/`WAITING_FOR_PERMISSION`/
`ERROR` — the same set `shouldNotify` already filters to) onto a Bordio
task per session, using pageB1's `BordioClient` and pageB2's
`bordio_links` mapping. Wired into `lifecycle.ts` alongside
`ConsoleNotificationService` — both subscribe independently to the same
bus, no change needed to `wireNotifications` — but only when
`BORDIO_API_KEY` is configured; off by default (ADR-006).

# Why
This is the point of Phase 2: session status shows up on the user's
existing Bordio board without them opening the mobile app. Everything
built in pageB1/B2 exists specifically to make this page a thin
composition, not new plumbing.

# Design
**One Bordio task per session** (pageB2's granularity decision), created
on the *first* notify-worthy event for a session and updated (title +
status) on every one after — looked up via `bordio_links`, not
recreated.

**Status mapping**: Bordio task-status definitions only carry a
universal `state: "open" | "closed"` (`research/bordio.md`) — the only
signal that means the same thing in every workspace regardless of what
the user has renamed their statuses to. `SESSION_COMPLETED`/`FAILED`/
`ERROR` map to `closed`; `WAITING_FOR_INPUT`/`WAITING_FOR_PERMISSION` map
to `open` (still actionable — the opposite of "done"). The actual
`task_status_id` for each state is either explicitly configured
(`BORDIO_OPEN_STATUS_ID`/`BORDIO_CLOSED_STATUS_ID`) or, if unset,
auto-discovered once via `listTaskStatusDefinitions()` (first definition
with the matching `state`) and cached in memory — so the integration
works out of the box with just `BORDIO_API_KEY` set, not a mandatory
second round of configuration before it does anything.

**Idempotency**: task creation is keyed off the session id
(`bordio-create-task-session-{sessionId}`) — `research/bordio.md`'s
idempotency section — so a crash between creating the Bordio task and
persisting the `bordio_links` row (the one real crash-window in this
design) replays the same task on retry instead of creating a duplicate.
That crash window is closed on the *next* notify-worthy event for the
same session even if the link write itself failed: `createTask` with the
same idempotency key returns the same task, so the link eventually gets
written.

**Title**: each Bordio task's title is set to the current notification's
title (`"Session completed"`, `"Session needs input"`, etc.) — updated
on every sync, not just at creation, so the Bordio board itself shows
the latest state without the user needing to open ClaudeOps. No tagging
in this page — pageB4 (inbound) needs its own distinct tag to identify
*user-created* command tasks, and reusing one tag for both directions
risks the future inbound poller picking up ClaudeOps's own
outbound-mirrored tasks as commands. Deferred to pageB4, not decided
here.

`apps/controller/src/domain/bordio/session-to-bordio-state.ts` — pure
mapping function (`DomainEventType` notify-worthy subset ->
`"open" | "closed"`), testable in isolation like `should-notify.ts`.

`apps/controller/src/adapters/bordio/bordio-notification-service.ts` —
`BordioNotificationService implements NotificationService`:
constructor(`BordioClient`, `BordioLinkRepository`, `Logger`, `{ openStatusId?, closedStatusId? }`).
`notify()`: resolve the target `state` via the mapping function above,
resolve the actual `task_status_id` (configured or auto-discovered +
cached), look up an existing link, `updateTask` or `createTask`+`upsert`
accordingly.

**Config** (`packages/config`): `BORDIO_API_KEY` (optional secret, unset
= integration disabled — the redaction denylist already matches any key
containing "key" case-insensitively, so no `packages/logging` change
needed), `BORDIO_OPEN_STATUS_ID`/`BORDIO_CLOSED_STATUS_ID` (optional).

**Wiring** (`lifecycle.ts`): when `config.BORDIO_API_KEY` is set,
construct a real `BordioApiClient` + `SqliteBordioLinkRepository` +
`BordioNotificationService`, call `wireNotifications` a second time (the
existing `Console` wiring is untouched). `StartControllerOverrides`
gains an optional `bordioClient?: BordioClient` so a lifecycle-level test
can substitute `FakeBordioClient` instead of a real network client even
when `BORDIO_API_KEY` is set for the test — matching how `claudeAdapter`/
`processDiscovery` are already injectable for the same reason.

# Implementation
1. `domain/bordio/session-to-bordio-state.ts` (+ test — every
   notify-worthy `DomainEventType` maps correctly).
2. `adapters/bordio/bordio-notification-service.ts` (+ test against
   `FakeBordioClient` + an in-memory `BordioLinkRepository` fake: first
   event creates with the right idempotency key, second event for the
   same session updates the same task rather than creating a second one,
   status-id auto-discovery is cached after the first call).
3. `packages/config/src/schema.ts` — the three new vars (+ test).
4. `lifecycle.ts` — conditional wiring; `StartControllerOverrides` gains
   `bordioClient`.
5. A `lifecycle.test.ts` (or new `bordio-lifecycle.test.ts`) case: start
   a controller with `BORDIO_API_KEY` set and a `FakeBordioClient`
   override, drive a session to `COMPLETED` via the real HTTP API,
   assert a Bordio task was actually created (via the fake) with the
   closed status — the real, not-mocked bar this project has used since
   page16.

# Files Changed
New: `apps/controller/src/domain/bordio/session-to-bordio-state.ts`
(+ test), `apps/controller/src/adapters/bordio/
bordio-notification-service.ts` (+ test). Modified: `packages/config/
src/schema.ts` (+ test), `apps/controller/src/lifecycle.ts` (+ its
test).

# Tests
Per-file unit tests above, plus two real lifecycle-level integration
tests added to `lifecycle.test.ts` (kept permanently in the suite, not a
throwaway script — this page's version of the "real, not mocked" bar
every page since page16 has used): a real `startController()`, real
`fetch()` HTTP calls to create a project and start a session, and
assertions against the injected `FakeBordioClient` and the real SQLite
`bordio_links` table. One test confirms the integration is fully inert
with `BORDIO_API_KEY` unset (no task ever created); the other confirms a
session reaching `COMPLETED` produces exactly one Bordio task with the
right title/status and a corresponding `bordio_links` row. No real
Bordio workspace available in this environment — same documented
limitation as pageB1/pageB2. `npm run typecheck`, `npm run lint`, `npm
test` green from root.

# Acceptance Criteria
- [x] A session's first notify-worthy event creates exactly one Bordio
      task, idempotency-keyed off the session id.
- [x] A session's subsequent notify-worthy events update that same task
      (title + status), never create a second one — verified by test.
- [x] Status mapping is correct for every notify-worthy event type.
- [x] Status-id auto-discovery only calls `listTaskStatusDefinitions()`
      once (cached), when no explicit `BORDIO_OPEN_STATUS_ID`/
      `BORDIO_CLOSED_STATUS_ID` is configured.
- [x] The integration is fully off (`BordioNotificationService` never
      constructed) when `BORDIO_API_KEY` is unset — existing behavior
      unchanged for every current test and deployment (verified by a
      real lifecycle-level test, not just by code review).
- [x] All tests pass; typecheck and lint clean.
- [x] `.claude/PROGRESS.md` updated.

# Risks
- No real Bordio workspace/key in this environment — the lifecycle-level
  manual check uses `FakeBordioClient` via the new override, not a real
  API call. Same accepted limitation as pageB1/pageB2 until the user
  provides real credentials.
- Status-id auto-discovery picks the *first* definition matching each
  `state` — if a workspace has multiple open/closed statuses (e.g. "To
  do" and "In progress" both open), which one gets used isn't
  user-controllable without setting the explicit env vars. Documented,
  not silently assumed correct.

# Completion Checklist
- [x] All Acceptance Criteria checked
- [x] `.claude/CHANGELOG.md` entry added
- [x] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/pageB4.md` written (inbound Bordio command polling)
      before starting pageB4
