# Page B4: Inbound Bordio command polling

# Objective
The other direction ADR-006 named: a Bordio task can trigger a ClaudeOps
command. Since Bordio has no webhooks (`research/bordio.md`), this is a
bounded, backed-off poller — same spirit as `ProcessDiscoveryService`'s
cross-check — that fetches tagged Bordio tasks, diffs against pageB2's
snapshot, and dispatches through the existing `CommandRouter` (page20),
not `IntentResolver` (ADR-006: Bordio tasks are structured, not free
text).

# Design

**Which task targets which session — reusing pageB2's link table for
both directions, not a new convention.** A brand-new, never-seen Bordio
task carries no reliable session reference with the minimal fields this
project's `BordioTask` models (title/status/type/tags/project — no
custom fields, `research/bordio.md`'s custom-fields section describes
them as "a richer definitions-like resource" pageB1 didn't build support
for). Rather than inventing a text convention (e.g. parsing a session id
out of a title) that's fragile and easy to get wrong by hand, this page
requires the target Bordio task to already be **linked** — i.e., one
pageB3's outbound sync already created for that session (the "Session
needs input" card the user sees when a session is waiting on them). The
user replies by editing that card's title to their instruction and
applying a configured command tag to it; the poller only ever considers
tasks it already knows the session for via `bordio_links.
findByBordioTaskId`. A tagged task with no link is skipped (logged, not
silently dropped) — starting a *new* session from Bordio isn't in scope
here; only replying to one ClaudeOps already surfaced is. This is a
real, documented scope boundary, not an oversight.

**Poll mechanics**: fetch tasks filtered by `tag_id: [BORDIO_COMMAND_TAG_ID]`
using `If-None-Match` from `bordio_poll_cursors` (cursor name
`"inbound-commands"`) — a real `304` short-circuits the whole tick (no
tasks to process, still costs one read against quota per
`research/bordio.md`, but far cheaper than always processing a full
list). On a `200`, for each returned task with an existing link: dispatch
`{ type: "SEND_INSTRUCTION", sessionId: link.claudeopsEntityId,
instruction: task.title }` through `CommandRouter.dispatch()`, then
**remove the command tag** from the task (`updateTask` with the tag
filtered out of `tagIds`) so the same instruction isn't redispatched next
tick. Untagging right after a successful dispatch is the primary
safeguard against duplicate dispatch; a crash in the narrow window
between dispatch succeeding and the untag call is a real but accepted
risk (documented below), not silently ignored.

`UpdateBordioTaskInput` (pageB1) gains an optional `tagIds?: string[]`
— the one interface change this page needs; `FakeBordioClient` and
`BordioApiClient` both already do partial-field updates, so this is a
type widening plus a `tag_ids` field on the real PATCH body, not a
redesign.

`domain/bordio/inbound-poller.ts` — `BordioInboundPoller`, constructed
with `BordioClient`, `BordioLinkRepository`, `BordioPollCursorRepository`,
`CommandRouter`, `Logger`, and the command tag id:
- `pollOnce(): Promise<void>` — one tick, fully testable in isolation
  (no timers) — matches `Reconciler`'s shape of separating the
  algorithm from its scheduling.
- `start(intervalMs): void` / `stop(): void` — `setInterval` +
  `.unref()` (same idiom `api/ws/server.ts`'s heartbeat already uses so
  it never blocks shutdown), catches and logs any `pollOnce()` rejection
  per tick rather than letting one bad poll kill the loop — same
  fire-and-forget-with-logged-failure shape every other background loop
  in this codebase uses.

**Config**: `BORDIO_COMMAND_TAG_ID` (optional; the poller only starts
when both this and `BORDIO_API_KEY` are set — a `tag_...` id is
workspace-specific and opaque, no auto-discovery is possible the way
open/closed status was in pageB3), `BORDIO_POLL_INTERVAL_MS` (default
60,000ms — one read/minute is far under the 120/min budget while still
being responsive; unlike `DISCOVERY_POLL_INTERVAL_MS`, page21's
documented dead config, this var is actually wired to something).

**Wiring** (`lifecycle.ts`): when `BORDIO_API_KEY` and
`BORDIO_COMMAND_TAG_ID` are both set, construct the poller (reusing the
same `bordioClient`/`SqliteBordioLinkRepository` pageB3 already
constructs in that scope) and call `.start()`; `.stop()` on controller
shutdown, same lifecycle as the WS heartbeat interval.
`StartControllerOverrides` gains nothing new — the existing `bordioClient`
override already covers testing this without real network access.

# Implementation
1. `domain/bordio/client.ts` — widen `UpdateBordioTaskInput` with
   `tagIds?: string[]`.
2. `adapters/bordio/bordio-client.ts` — send `tag_ids` on `updateTask`
   when provided.
3. `domain/bordio/inbound-poller.ts` (+ test: a linked tagged task
   dispatches the right `Command` and gets untagged; an unlinked tagged
   task is skipped, not dispatched; a `304`/unchanged poll does nothing;
   a `pollOnce()` rejection during `.start()`'s interval loop is caught
   and logged, not thrown).
4. `packages/config/src/schema.ts` — `BORDIO_COMMAND_TAG_ID`,
   `BORDIO_POLL_INTERVAL_MS` (+ test).
5. `lifecycle.ts` — conditional poller construction/start/stop; `Controller`
   gains an optional `pollBordioInboundCommandsNow?: () => Promise<void>`
   test-only escape hatch (same precedent as `db` already being exposed
   for test introspection) so a test can force one poll tick instead of
   waiting a real interval.
6. Two `lifecycle.test.ts` cases: (a) drive a real session to
   `WAITING_FOR_INPUT` via `FakeClaudeSessionAdapter` so pageB3's
   outbound sync creates and links a real (fake-backed) Bordio task,
   simulate the user's reply by tagging+retitling that same task via
   `FakeBordioClient`, force a poll tick, and assert the session actually
   received the instruction (`GET /sessions/:id/tasks`) and the task lost
   its tag; (b) `pollBordioInboundCommandsNow` is `undefined` when
   `BORDIO_COMMAND_TAG_ID` is unset.

# Files Changed
Modified: `apps/controller/src/domain/bordio/client.ts`,
`apps/controller/src/adapters/bordio/bordio-client.ts`,
`packages/config/src/schema.ts` (+ test), `apps/controller/src/
lifecycle.ts` (+ test). New: `apps/controller/src/domain/bordio/
inbound-poller.ts` (+ test).

# Tests
Per-file unit tests above (`inbound-poller.test.ts` drives `pollOnce()`
directly — no real timers needed for correctness tests) plus one
lifecycle-level integration test calling `pollOnce()` directly rather
than waiting a real interval (fast, deterministic, still exercises the
real `startController()` + `CommandRouter` + `FakeClaudeSessionAdapter`
stack end to end). `npm run typecheck`, `npm run lint`, `npm test` green
from root.

# Acceptance Criteria
- [x] A linked, command-tagged Bordio task dispatches `SEND_INSTRUCTION`
      for the correct session and is untagged afterward.
- [x] An unlinked (not previously mirrored) tagged task is skipped, not
      dispatched — verified by test, matching the documented scope
      boundary above.
- [x] A `304`/unchanged poll performs no work and doesn't call
      `CommandRouter.dispatch()`.
- [x] The poller is fully off when `BORDIO_COMMAND_TAG_ID` is unset, even
      if `BORDIO_API_KEY` is set (outbound-only is a valid, common
      configuration) — verified by a real lifecycle-level test.
- [x] All tests pass; typecheck and lint clean.
- [x] `.claude/PROGRESS.md` updated.

# Risks
- The crash window between a successful `CommandRouter.dispatch()` and
  the untag call that follows it: if the controller dies in exactly that
  gap, the next poll would see the still-tagged task and redispatch the
  same instruction. Accepted for this page (closing it fully needs
  either Bordio-side idempotency on the tag-removal side, which doesn't
  exist, or a locally persisted "already dispatched this task version"
  marker — deferred, not silently assumed safe).
- Only *linked* tasks can receive inbound commands (see Design) —
  starting a brand-new session purely from Bordio is out of scope for
  this page; flagged as a real, deliberate limitation for whoever revisits
  this in Phase 2's B5 or later.
- No real Bordio workspace/key in this environment — verified against
  `FakeBordioClient` only, same carried-forward limitation as pageB1-B3.

# Completion Checklist
- [x] All Acceptance Criteria checked
- [x] `.claude/CHANGELOG.md` entry added
- [x] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/pageB5.md` written (Phase 2 hardening pass) before
      starting pageB5
