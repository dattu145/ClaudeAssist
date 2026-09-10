# Page B5: Phase 2 hardening pass (final Phase 2 page)

# Objective
Same shape as page21: a pass over pageB1-B4, not a new feature. Bounded
memory/backoff audit, recovery behavior for the `bordio_links`/
`bordio_poll_cursors` tables across a restart, and docs (`RISKS.md`,
`SECURITY.md`, `PROGRESS.md`) finalized for Phase 2's close.

# Findings (audit performed before writing the implementation plan below)

**Bounded memory**: audited every Bordio component added in pageB1-B4
(`BordioApiClient`, `BordioNotificationService`, `BordioInboundPoller`).
None hold a `Map`/`Set` keyed by session or task that grows for the
life of the process — every piece of durable state lives in SQLite
(`bordio_links`, `bordio_poll_cursors`) behind the repositories pageB2
built. `BordioNotificationService`'s only in-memory state is two cached
status-id strings (`cachedOpenStatusId`/`cachedClosedStatusId`) — fixed
size, not per-entity. No new unbounded-growth risk to add to `RISKS.md`,
unlike `ClaudeCodeAdapter`'s finding in page21 — confirmed by reading,
not assumed.

**Backoff / critical-path blocking**: `InProcessEventBus.publish()`
(`domain/events/bus.ts`) calls every subscriber handler synchronously
but never awaits the async work a handler kicks off — `wireNotifications`
(page19)'s handler calls `notificationService.notify(notification).catch(...)`
without `await`, so the promise runs in the background. This means
`BordioApiClient`'s retry/backoff (up to ~3.5s across 3 attempts on a
persistent 500) **cannot block** a session dispatch or an HTTP request —
confirmed by reading the actual call chain, not assumed, since this
was the natural first question for a hardening pass on anything that
makes a real network call from an event handler.

**Recovery — the mapping table across a restart**: this is the real gap
this page closes. `bordio_links` is written by instance A; instance B
(a fresh process, per page16's restart model) must find and use the same
row, not create a duplicate Bordio task for a session it already
mirrored. This was implicitly relied on but never exercised end-to-end
across two real controller instances — `lifecycle.test.ts`'s pageB3/B4
tests all run against a single instance. A full-stack recovery test
(same pattern as page21's `recovery.test.ts`: two real
`startController()` calls sharing one on-disk `DATA_DIR`) closes this.

**Pagination limit in `BordioInboundPoller.pollOnce()`**: `listTasks()`
with the command-tag filter doesn't follow `nextCursor` — a poll tick
only processes the first page. Under normal use (a handful of
in-flight command tasks at once) this never matters; under a large
backlog it's throughput-bounded to one page per poll interval rather
than broken — each processed task gets untagged, so it drops out of the
tag-filtered set and the *next* tick naturally picks up what was
previously page 2. Self-correcting, not a duplicate-dispatch or
lost-task bug, but flagged in `RISKS.md` rather than silently assumed
fine, since it wasn't an explicit design decision until this audit
found it.

# Design
1. `apps/controller/src/bordio-recovery.test.ts` — mirrors page21's
   `recovery.test.ts` exactly: instance A (`BORDIO_API_KEY` set, a
   `FakeBordioClient`) creates a project + session, drives it to
   `WAITING_FOR_INPUT` (pageB3 creates and links a Bordio task), stops.
   Instance B starts against the *same* `DATA_DIR` with a *different*
   `FakeBordioClient` instance (simulating a real restart — no shared
   in-memory state, only the shared SQLite file) pre-seeded with the
   *same* task id instance A's fake created (representable since the
   fake is deterministic — the test constructs B's fake with that task
   already present, standing in for "the real Bordio task still exists
   remotely"). Drives the same session to `SESSION_COMPLETED` on
   instance B and asserts: the *existing* task gets updated (title +
   `closed` status), not a second one created — proving `bordio_links`
   survived the restart and did its job.
2. `RISKS.md` — the pagination-limit finding above; a line noting the
   memory/backoff audit found nothing new to flag (explicit, not a
   silent absence).
3. `SECURITY.md` — the pageB3-era "proposed, not yet built" note for
   `BORDIO_API_KEY` is now stale (it's built) — updated to reflect the
   actual, implemented state and cross-reference `RISKS.md`'s pagination
   note as a non-security limitation worth knowing about.
4. `PROGRESS.md` — a Phase 2 close-out section, same shape as Phase 1's,
   checked against `research/bordio.md`/`decisions/ADR-006.md`/the
   pageB1-B5 acceptance criteria (this phase's own proposal *is* its
   acceptance checklist — no external spec ambiguity like Phase 1 had).

# Implementation
1. `bordio-recovery.test.ts` (new).
2. `.claude/RISKS.md`, `.claude/SECURITY.md`, `.claude/PROGRESS.md`
   updates per Design #2-4.

# Files Changed
New: `apps/controller/src/bordio-recovery.test.ts`. Modified:
`.claude/RISKS.md`, `.claude/SECURITY.md`, `.claude/PROGRESS.md`.

# Tests
The new recovery test (real two-instance, shared-DB pattern). `npm run
typecheck`, `npm run lint`, `npm test` green from root.

# Acceptance Criteria
- [x] A `bordio_links` row written by one controller instance is
      correctly found and used by a second instance sharing the same
      `DATA_DIR` — no duplicate Bordio task created across a restart,
      verified by a real two-instance test.
- [x] Bounded-memory and critical-path-blocking audit findings are
      documented (both "nothing new to flag" and the pagination
      limitation) — not silently assumed clean.
- [x] `RISKS.md`/`SECURITY.md` reflect Phase 2's actual, implemented
      state, not the pageB3-era "proposed" language.
- [x] `PROGRESS.md` has a Phase 2 close-out section.
- [x] All tests pass; typecheck and lint clean.

# Risks
- No real Bordio workspace/key in this environment — same carried-
  forward limitation as every prior Phase 2 page; this page's recovery
  test is real-controller/real-SQLite but still `FakeBordioClient`-backed.

# Completion Checklist
- [x] All Acceptance Criteria checked
- [x] `.claude/CHANGELOG.md` entry added
- [x] `.claude/PROGRESS.md` updated (Phase 2 close-out)
- [x] Phase 2 complete — no pageB6; next work is Phase 3+ (voice, out of
      this roadmap) or the still-open git push access item
