# Research: Bordio Integration (Phase 2)

Researched 2026-09-10 against `docs.bordio.com` (product docs are markdown-
rendered and fetchable directly; `api.bordio.com/public/v1/docs` is a
JS-rendered reference — Swagger/Redoc-style — that could not be fetched as
text; the page-by-page developer docs below cover everything needed to
design against).

## Auth
- Bearer secret API key: `Authorization: Bearer brd_sk_live_...`.
- Keys are scoped along two axes: read vs. read-write, and workspace-wide
  vs. single-project. Bordio's own docs are explicit: **"Secret keys are
  server-side only. Never embed a key in a browser, mobile app, or any
  client you don't control."** — matches this project's existing rule
  (`SECURITY.md`: secrets never in the mobile app) exactly; no new
  exception needed, just apply the existing one.
- No OAuth option — a single long-lived key per workspace/project is the
  only model. Store it the same way `PAIRING_TOKEN_TTL` etc. are
  configured today: a controller-side env var, never persisted in SQLite,
  never logged (existing redaction in `packages/logging` already
  denylist-redacts known-sensitive keys; a new key name needs adding).

## Base URL & envelope
- `https://api.bordio.com/public/v1/`.
- List responses: `{ "data": [...], "pagination": { "next_cursor": ..., "has_more": bool } }`.
  Cursor is opaque — never parse it.
- Error responses: `{ "error": { "type", "code", "message", "request_id", "errors"?, "details"? } }`.
  Errors map cleanly onto this project's existing `DomainError`/
  `domainErrorHttpStatus` pattern: `401 authentication_error`, `403
  permission_error`, `404 not_found_error`, `409 conflict_error`
  (includes idempotency-key conflicts), `422 validation_error`, `429
  rate_limit_error` (retriable, honor `Retry-After`), `500 api_error`
  (retriable).

## IDs
- Opaque, prefixed, permanent: `task_...`, `proj_...`, `tag_...`,
  `user_...`. "Store the whole id and send it back verbatim." — this
  project already follows that discipline for its own IDs
  (`generateId` prefixed IDs in `packages/shared`), so no adjustment
  needed, just a new persisted mapping (see Design below).

## Rate limits — the load-bearing constraint for the whole design
- **120 GET/min, 60 write (POST/PATCH/DELETE)/min, per API key**,
  independent buckets. Communicated via `RateLimit-Limit`/
  `RateLimit-Remaining`/`RateLimit-Reset` headers on every response —
  read from these, never hard-code the numbers. `429` carries
  `Retry-After`.
- Conditional requests (`ETag` / `If-None-Match`, all GET endpoints,
  weak comparison per RFC 7232) still **count against the read quota** —
  a `304` is cheap on bandwidth, not on rate limit. This matters for
  Design decision #2 below: polling must be genuinely bounded, not
  "poll fast because 304s are free."

## Webhooks: do not exist yet
Bordio's own webhooks page: **"Webhooks are not part of the API yet.
This page is a placeholder for an upcoming feature."** Their documented
workaround is exactly what this design uses: **poll the relevant GET
endpoints and use caching (ETags) to keep polling cheap.** This is the
single most important finding — it rules out an event-driven inbound
integration for now and makes polling-with-backoff the only option,
symmetric with how this project already treats `ProcessDiscoveryService`
(bounded, diagnostic-style polling, never load-bearing for correctness
on its own).

## Idempotency
- `Idempotency-Key` header on `POST` (creates only, not `PATCH`/`DELETE`),
  up to 255 chars, UUID recommended. Same key + same body replays the
  original result (no duplicate); same key + different body is a `409`;
  keys expire after 24h. **Directly solves the "controller restarts
  mid-sync" correctness problem** — every Bordio task creation this
  integration performs should be idempotency-keyed off the ClaudeOps
  entity ID it mirrors (e.g. `bordio-create-task-{claudeTaskId}`), so a
  crash-and-retry can never create a duplicate Bordio task.

## Task shape
- `status` and `type` are workspace-level **definitions**, referenced by
  opaque `id` (e.g. `task_status_id`), not by name — must be fetched
  once (`GET` on the definitions endpoint) and mapped to this project's
  own `TaskStatus`/`SessionStatus` enums via config, not hard-coded,
  since every Bordio workspace's actual status names ("To do", "In
  progress", "Done", or whatever the user has renamed them to) are
  user-specific. Definitions only carry a `state: "open" | "closed"` —
  that's the only universal signal available for a default mapping.
- `priority`: fixed enum (`lowest`/`low`/`medium`/`high`/`critical`),
  not customizable, no obvious mapping to anything in this project's
  domain model — leave unset unless/until a real need appears.
- Filtering (`GET /tasks`): `assignee_id`, `tag_id`, `task_status_id`,
  `task_type_id`, `priority`, `due_date*` — AND across params, OR within
  a CSV param. **No "updated since" filter and no custom-field filter.**
  This means inbound polling must narrow the candidate set with `tag_id`
  (a dedicated tag, e.g. "claudeops") and/or `assignee_id`, then diff the
  returned set against a locally persisted last-seen snapshot (by ETag
  or by comparing task fields) to find what actually changed — Bordio's
  API gives no cheaper way to ask "what's new since X."

## Conclusion for the design below
Outbound (ClaudeOps -> Bordio, mirroring session/task lifecycle onto a
Bordio task board) is straightforward: a `NotificationService`
implementation, same interface page19 already built, using idempotency
keys for crash-safety. Inbound (Bordio -> ClaudeOps, a Bordio task
triggering a `CommandRouter` dispatch) is possible but rate-limited and
polling-only — no webhooks — so it must be a bounded, backed-off poller
in the same spirit as `ProcessDiscoveryService`'s cross-check, not
anything resembling a live subscription.
