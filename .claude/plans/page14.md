# Page 14: Pairing & Auth

# Objective
Close the security gap every prior page has been building against
unauthenticated: a pairing-code exchange (`POST /pairing/exchange`) and a
bearer-token auth middleware applied to everything except `GET /health` and
the exchange endpoint itself, per SECURITY.md's pairing design (already
written in page1's docs, unimplemented until now).

# Design
- **Pairing code**: an 8-char human-typable code (uppercase alnum, excluding
  `0/O`/`1/I` to avoid transcription errors), generated fresh on every
  controller startup, single-use, short TTL (10 minutes — no existing config
  var for this, a sensible hardcoded default; unlike the token TTL there's
  no reason a human would want to configure how long they have to type a
  code they just saw in the log). Logged at `info` level on startup so it's
  visible with default `LOG_LEVEL`. Any codes from a previous run are
  invalidated on startup — a stale code from an old process should never
  work.
- **Pairing token**: a long random secret (32 bytes), returned once, in the
  exchange response. **Stored hashed (SHA-256) at rest** — unlike the
  pairing code (short-lived, single-use, low value), a token is a
  long-lived credential; a DB leak must not directly expose usable secrets.
  Verified by hashing the presented token and looking up the hash (no
  plaintext comparison, no timing side-channel from a loop).
  Expires after `packages/config`'s `PAIRING_TOKEN_TTL` (defined since
  page2, unused until now) and is revocable (`POST /pairing/revoke`,
  itself authenticated — revokes the token used to make the call).
- **Auth middleware**: checks `Authorization: Bearer <token>`, verifies via
  `PairingRegistry.verifyToken` (hash lookup + expiry + revocation check),
  responds `401 {"error":"UNAUTHORIZED"}` on failure. Implemented as plain
  Express middleware, not routed through the `DomainError` mapping — 401 is
  a cross-cutting transport concern, not a domain-not-found/invalid-input
  case the existing `*_NOT_FOUND`/`INVALID_*` scheme fits.
- **`startController` becomes async**: issuing the startup pairing code is
  the first startup-time operation that needs the repository (Promise-
  returning per ADR-004). Rather than force `PairingRepository` to be
  synchronous (breaking the established repository pattern for one page),
  `startController`'s signature changes to `Promise<Controller>` — its only
  two callers (`index.ts`, `lifecycle.test.ts`) are updated to `await` it.

# Implementation
1. `packages/protocol/src/pairing.ts` — `ExchangePairingCodeRequestSchema
   { code }`, `PairingTokenResponseSchema { token, expiresAt }`.
2. `domain/errors.ts` — `PairingCodeInvalidError` (code
   `INVALID_PAIRING_CODE`, 400 via the existing generic mapping).
3. `domain/pairing/entity.ts` — `generatePairingCode()`,
   `generatePairingToken()`, `hashToken()`, `PAIRING_CODE_TTL_MS`, and the
   `PairingCodeRecord`/`PairingTokenRecord` internal shapes.
4. `domain/pairing/repository.ts` — `PairingRepository`: `createCode`,
   `findActiveCodeByValue`, `consumeCode`, `invalidateAllCodes`,
   `createToken`, `findTokenByHash` (excludes revoked/expired),
   `touchTokenLastUsed`, `revokeToken`.
5. `db/migrations/0006_pairing.sql` — `pairing_codes` + `pairing_tokens`
   tables. No FK relationships to projects/sessions (pairing is
   controller-identity-level, not domain data).
6. `adapters/persistence/sqlite/pairing-repository.ts` —
   `SqlitePairingRepository`.
7. `domain/pairing/registry.ts` — `PairingRegistry(repository, logger,
   tokenTtlSeconds)`: `issueStartupCode()` (invalidates old codes, issues
   and persists a new one, returns it for `lifecycle.ts` to log),
   `exchangeCode(code)` (throws `PairingCodeInvalidError`; returns the raw
   token), `verifyToken(rawToken)` (boolean; touches `lastUsedAt` on
   success), `revokeToken(rawToken)`.
8. `api/http/auth-middleware.ts` — `createAuthMiddleware(pairingRegistry)`.
9. `api/http/pairing.ts` — `POST /exchange` (public), `POST /revoke`
   (route-level auth middleware).
10. `server.ts` — mount order: `GET /health` and `/pairing` stay
    unauthenticated; the auth middleware is applied before `/projects` and
    `/sessions` are mounted, so every route after it requires a valid token.
11. `lifecycle.ts` — becomes `async function startController`; constructs
    `PairingRegistry`, calls `issueStartupCode()`, logs the code clearly.
12. `index.ts` / `lifecycle.test.ts` — updated to `await startController(...)`.

# Files Changed
New: `domain/pairing/{entity,repository,registry}.ts` (+ tests),
`db/migrations/0006_pairing.sql`,
`adapters/persistence/sqlite/pairing-repository.ts` (+ test),
`api/http/{auth-middleware,pairing}.ts` (+ tests),
`packages/protocol/src/pairing.ts` (+ test). Modified: `domain/errors.ts`,
`server.ts`, `lifecycle.ts`, `index.ts`, `lifecycle.test.ts`,
`test-support/build-test-app.ts` (needs a pairing registry + a way for
existing route tests to authenticate), every existing HTTP route test
(now needs a valid bearer token to keep passing).

# Tests
Token hashing round-trip, code TTL/single-use/invalidate-on-startup
behavior, `verifyToken` expiry/revocation, the auth middleware's 401 cases,
`POST /pairing/exchange` end-to-end (code -> token -> authenticated
request succeeds), `POST /pairing/revoke` (revoked token then fails auth).
`npm run typecheck`, `npm run lint`, `npm test` green from root.

# Acceptance Criteria
- [ ] No route except `GET /health` and `POST /pairing/exchange` is
      reachable without a valid, unexpired, unrevoked token — verified by
      test, not just by review of mount order.
- [ ] Pairing tokens are never stored in plaintext (verified by inspecting
      what's actually written to the `pairing_tokens` table in a test).
- [ ] A stale pairing code from a previous controller run cannot be used
      after restart.
- [ ] `packages/config`'s `PAIRING_TOKEN_TTL` is actually consumed, not
      just defined.
- [ ] All tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- Single-token-per-mobile-device model: there's no per-device tracking yet
  (spec's future MULTI-USER PERMISSIONS is explicitly out of scope) — any
  valid token can do anything any other can. Fine for Phase 1 (single
  user), flagged for whoever picks up multi-user work later.
- No rate-limiting on `POST /pairing/exchange` — a very small attack
  surface (LAN-only, short TTL, single-use codes) but noted, not
  hardened, to avoid scope creep into a general rate-limiting story this
  page didn't ask for.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page15.md` written (ProcessDiscoveryService) before
      starting page15
