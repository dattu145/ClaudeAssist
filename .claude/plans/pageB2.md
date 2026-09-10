# Page B2: Bordio ID mapping persistence

# Objective
Persistence for the two pieces of state pageB3 (outbound) and pageB4
(inbound) both need but neither should own directly: the ClaudeOps<->
Bordio task ID mapping, and a poll cursor for the inbound poller to
detect "what changed" against — since Bordio's API has no "updated
since" filter (`research/bordio.md`). Same repository-interface pattern
every other piece of Phase 1 persistence used (`ProjectRepository`,
`PairingRepository`, etc.) — SQLite behind an interface, so pageB3/B4
depend on the interface, not the storage engine.

# Why
`ADR-006` names outbound sync as idempotency-keyed per "the ClaudeOps
entity being mirrored" — that requires knowing, durably, which Bordio
task already mirrors a given ClaudeOps session (so a restart doesn't
lose track and re-create it, and so an update targets the right Bordio
task, not just a create). `ADR-006`'s inbound design polls Bordio and
diffs against a snapshot — that snapshot has to survive a restart too,
or every restart would re-process every tagged Bordio task as if it
were new.

# Design
**Mapping granularity: session-level, not task-level.** The
notify-worthy events `shouldNotify` (page19) recognizes —
`SESSION_COMPLETED`/`FAILED`/`WAITING_FOR_INPUT`/`WAITING_FOR_PERMISSION`/
`ERROR` — are all session-scoped, not task-scoped, and pageB3's
`BordioNotificationService` consumes exactly those. So one Bordio task
tracks one ClaudeOps *session's* lifecycle, not one per `Task` (a
session can have many tasks; mirroring each would flood the user's
Bordio board with one card per instruction, which isn't what "see your
session status in Bordio" means). The link table is still generic on
entity type rather than hard-coded to `session_id`, in case a future
page genuinely needs task-level links — that costs two extra columns
now, not a redesign later.

`db/migrations/0007_bordio.sql`:
```sql
CREATE TABLE bordio_links (
  id TEXT PRIMARY KEY,
  claudeops_entity_type TEXT NOT NULL, -- 'session' is the only value used so far
  claudeops_entity_id TEXT NOT NULL,
  bordio_task_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- No FK: claudeops_entity_id can reference different tables depending on
-- claudeops_entity_type (same reasoning pairing_codes/pairing_tokens
-- already document for their own no-FK choice).
CREATE UNIQUE INDEX idx_bordio_links_entity ON bordio_links(claudeops_entity_type, claudeops_entity_id);
CREATE INDEX idx_bordio_links_bordio_task_id ON bordio_links(bordio_task_id);

CREATE TABLE bordio_poll_cursors (
  name TEXT PRIMARY KEY, -- e.g. 'inbound-tasks' — named, not a single
                          -- global row, in case a future page adds a
                          -- second independently-polled query
  etag TEXT,
  polled_at TEXT NOT NULL
);
```

`bordio_poll_cursors` intentionally stores only what's unconditionally
useful regardless of how pageB4 ends up diffing (an ETag to cheaply
short-circuit an unchanged poll via a real 304, and a timestamp) — not a
per-task last-seen snapshot, since that shape depends on pageB4's actual
diff algorithm (which field(s) count as "changed" isn't decided yet, and
guessing it now risks building the wrong schema). pageB4 adds whatever
more it needs once that design is real, not before.

`domain/bordio/link.ts` — `BordioLink` type + `createBordioLink()`
(mirrors `createPairingCodeRecord`'s shape: plain data + `generateId`,
no class). `domain/bordio/link-repository.ts` — `BordioLinkRepository`
interface: `upsert`, `findByClaudeOpsEntity(type, id)`,
`findByBordioTaskId(id)`.

`domain/bordio/poll-cursor.ts` + `poll-cursor-repository.ts` —
`BordioPollCursorRepository`: `get(name)`, `set(name, etag, polledAt)`.

`adapters/persistence/sqlite/bordio-link-repository.ts` and
`bordio-poll-cursor-repository.ts` — SQLite implementations, same
row-mapping-function pattern every other SQLite repository in this
codebase uses.

# Implementation
1. `db/migrations/0007_bordio.sql`.
2. `domain/bordio/{link,link-repository}.ts`.
3. `domain/bordio/{poll-cursor,poll-cursor-repository}.ts`.
4. `adapters/persistence/sqlite/bordio-link-repository.ts` (+ test).
5. `adapters/persistence/sqlite/bordio-poll-cursor-repository.ts` (+ test).

# Files Changed
New: `apps/controller/src/db/migrations/0007_bordio.sql`,
`apps/controller/src/domain/bordio/{link,link-repository,poll-cursor,
poll-cursor-repository}.ts`, `apps/controller/src/adapters/persistence/
sqlite/{bordio-link-repository,bordio-poll-cursor-repository}.ts`
(+ their `.test.ts` files).

# Tests
Round-trip tests per repository (create/find/upsert, unique-constraint
behavior on `bordio_links`' entity index, cursor get/set) against a real
temp-file SQLite DB — same pattern `pairing-repository.test.ts` etc.
already use. `npm run typecheck`, `npm run lint`, `npm test` green from
root. No lifecycle-level manual check — this page, like pageB1, isn't
wired into a running controller yet (pageB3's job).

# Acceptance Criteria
- [x] `bordio_links` enforces one link per `(claudeops_entity_type,
      claudeops_entity_id)` — verified by test (a second `upsert` for the
      same entity updates, not duplicates).
- [x] `bordio_poll_cursors` round-trips `get`/`set` correctly, including
      a `get` for a cursor `name` that's never been set (returns `null`,
      doesn't throw).
- [x] All tests pass; typecheck and lint clean.
- [x] `.claude/PROGRESS.md` updated.

# Risks
- The poll-cursor schema is deliberately minimal (see Design) — if
  pageB4's diff algorithm turns out to need per-task state, that's a new
  migration then, not a gap in this one; flagged here so it isn't a
  surprise.

# Completion Checklist
- [x] All Acceptance Criteria checked
- [x] `.claude/CHANGELOG.md` entry added
- [x] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/pageB3.md` written (BordioNotificationService,
      outbound) before starting pageB3
