# Page B1: BordioClient adapter + FakeBordioClient

# Objective
The `BordioClient` port (the abstraction pageB3's `BordioNotificationService`
and pageB4's inbound poller will depend on) plus a deterministic
`FakeBordioClient`, built before any real usage — same fake-before-real
precedent as page7/page8 for `ClaudeSessionAdapter`. Standalone and not
wired into `lifecycle.ts` yet (matching how page7 landed before page9's
consumer did); this page only builds and tests the adapter on its own.

# Why
`research/bordio.md` and `decisions/ADR-006.md` establish the real API
surface and the design direction. Building the interface first, against a
fake, means pageB3/pageB4 can be developed and tested without a real
`BORDIO_API_KEY` or real network access — matching `TEST_PLAN.md`'s
"Adapter (fake)" layer and how every external dependency in this project
(the `claude` CLI included) has been handled.

# Design
`apps/controller/src/domain/bordio/client.ts` — the port (domain layer,
matching `domain/process-discovery/service.ts`'s precedent: an interface
with no SQLite/network dependency of its own):

```ts
export interface BordioTask {
  id: string;
  title: string;
  statusId: string;
  typeId: string | null;
  tagIds: string[];
  projectId: string | null;
}

export interface CreateBordioTaskInput {
  title: string;
  statusId?: string;
  typeId?: string;
  tagIds?: string[];
  projectId?: string;
}

export interface UpdateBordioTaskInput {
  title?: string;
  statusId?: string;
}

export interface ListTasksOptions {
  tagIds?: string[];
  statusIds?: string[];
  cursor?: string;
  /** Sent as If-None-Match; research/bordio.md — all GET endpoints
   * support conditional requests. No caching layer exists yet
   * (pageB2/B4's job) — this just exposes the capability. */
  ifNoneMatch?: string;
}

export interface ListTasksResult {
  /** true on a real 304 — `tasks` is empty in that case. */
  notModified: boolean;
  tasks: BordioTask[];
  nextCursor: string | null;
  hasMore: boolean;
  etag: string | null;
}

export interface BordioDefinition {
  id: string;
  name: string;
  state: "open" | "closed";
}

export interface BordioClient {
  listTasks(options?: ListTasksOptions): Promise<ListTasksResult>;
  createTask(input: CreateBordioTaskInput, idempotencyKey: string): Promise<BordioTask>;
  updateTask(id: string, input: UpdateBordioTaskInput): Promise<BordioTask>;
  listTaskStatusDefinitions(): Promise<BordioDefinition[]>;
}
```

`idempotencyKey` is a required caller-supplied parameter, not invented by
the client — pageB3 derives it from the ClaudeOps entity being mirrored
(research/bordio.md's idempotency section); the client's job is just to
send the header correctly, not decide business-level key derivation.

`apps/controller/src/adapters/bordio/errors.ts` — `BordioApiError`
(message, `type`, `code`, `status`, `requestId`), constructed from the
real error envelope (`research/bordio.md`'s Errors section). Adapter-level,
not a `DomainError` — this is an external API failure, not a domain rule
violation, matching how this codebase separates the two.

`apps/controller/src/adapters/bordio/bordio-client.ts` —
`BordioApiClient implements BordioClient`: real `fetch`-based client.
- `Authorization: Bearer <apiKey>` (constructor param, never read from
  `process.env` itself — matching `ClaudeCodeAdapter`'s pattern of taking
  its dependencies as constructor args so lifecycle.ts owns config wiring,
  deferred to pageB3).
- Retries: honors `Retry-After` on `429`; bounded exponential backoff
  (3 attempts) on `500`/`api_error`; every other error type
  (`401`/`403`/`404`/`409`/`422`) throws `BordioApiError` immediately,
  no retry (research/bordio.md's Errors section: non-retriable).
- Logs a warning (never throws) when a response's `RateLimit-Remaining`
  header drops below a small threshold — visibility without building a
  full proactive throttle in this page (no real caller exists yet to need
  one; pageB3/B4 revisit if real usage shows it's needed).
- Never logs the API key or the raw `Authorization` header value.

`apps/controller/src/adapters/bordio/fake-bordio-client.ts` —
`FakeBordioClient implements BordioClient`: deterministic in-memory
implementation (a `Map`, incrementing fake `task_...` IDs), enforcing the
same idempotency-key replay-vs-conflict behavior real Bordio documents
(same key + same body -> replay; same key + different body -> throws a
`BordioApiError` shaped like a real `409 conflict_error`) so tests
exercising the fake also exercise that real behavior.

# Implementation
1. `domain/bordio/client.ts` (interface + types, no test — a pure type
   file, same as `domain/session/adapter.ts`).
2. `adapters/bordio/errors.ts` (+ test — envelope parsing into
   `BordioApiError`).
3. `adapters/bordio/fake-bordio-client.ts` (+ test — CRUD round-trip,
   idempotency replay/conflict, conditional-GET `notModified` behavior).
4. `adapters/bordio/bordio-client.ts` (+ test against a mocked `fetch` —
   auth header, retry/backoff on 429/500, non-retry on 4xx, rate-limit
   warning log, idempotency header sent correctly). A separate opt-in
   `bordio-client.real.test.ts` (skipped by default, requires a real
   `BORDIO_API_KEY` env var) exercises it against the real API — same
   pattern as `claude-code-adapter.real.test.ts`.

# Files Changed
New: `apps/controller/src/domain/bordio/client.ts`,
`apps/controller/src/adapters/bordio/{errors,bordio-client,
fake-bordio-client}.ts` (+ their `.test.ts` files),
`apps/controller/src/adapters/bordio/bordio-client.real.test.ts`.

# Tests
Unit tests per file above (fake + real-against-mocked-fetch). The opt-in
real-API suite is skipped by default (`describe.skip` unless
`BORDIO_API_KEY` is set, matching the existing real-CLI suite's pattern)
— not run as part of this page's verification since no real Bordio
workspace/key is available in this environment; documented as an
accepted limitation, same as the real-CLI suite always has been.
`npm run typecheck`, `npm run lint`, `npm test` green from root.

# Acceptance Criteria
- [x] `BordioClient` interface covers everything pageB3 (create/update
      task) and pageB4 (list with filtering + conditional GET) need —
      verified by re-reading ADR-006's stated scope for both pages before
      finalizing the interface, not guessed at.
- [x] `FakeBordioClient` enforces the same idempotency-key semantics real
      Bordio documents (verified by test, not just implemented).
- [x] `BordioApiClient` retries 429 (honoring `Retry-After`) and 500, does
      not retry other 4xx, never logs the API key.
- [x] All tests pass; typecheck and lint clean.
- [x] `.claude/PROGRESS.md` updated.

# Risks
- No real `BORDIO_API_KEY`/workspace available in this environment — the
  real client is verified against a mocked `fetch` (request shape,
  header handling, retry logic) plus the opt-in real-API suite is written
  but not run here. Same accepted-limitation shape as
  `claude-code-adapter.real.test.ts` since page8.
- The rate-limit-warning-log-only (not a real throttle) choice could prove
  insufficient once pageB3/B4 add real callers generating real traffic —
  explicitly flagged as revisitable then, not a silent gap.

# Completion Checklist
- [x] All Acceptance Criteria checked
- [x] `.claude/CHANGELOG.md` entry added
- [x] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/pageB2.md` written (Bordio ID mapping persistence)
      before starting pageB2
