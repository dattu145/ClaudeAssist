# Security

## Pairing (mobile <-> controller auth) — implemented page14
- Controller generates a fresh 8-char pairing code on every startup
  (logged at `info` level; any code from a previous run is invalidated),
  10-minute TTL, single-use. `PairingRepository`-backed
  (`pairing_codes`/`pairing_tokens` tables, no FK to domain data).
- `POST /pairing/exchange` (unauthenticated, alongside `GET /health`)
  trades a valid code for a long-lived bearer token
  (`packages/config`'s `PAIRING_TOKEN_TTL`, default 30 days). The raw
  token is returned exactly once, at exchange time.
- **Tokens are stored hashed (SHA-256) at rest, never in plaintext** —
  verified via hash lookup, not a plaintext/timing-sensitive comparison.
- Every route except `GET /health` and `/pairing/*` requires
  `Authorization: Bearer <token>` (`createAuthMiddleware`, mounted before
  `/projects` and `/sessions`); an unauthenticated or invalid/expired/
  revoked request gets `401 {"error":"UNAUTHORIZED"}`.
- `POST /pairing/revoke` (itself authenticated) revokes the token used to
  call it — the "log out this device" action. Mobile-side secure storage
  of the token (Expo SecureStore) is a page17+ concern, not this page's.

## Secrets
- Anthropic credentials, shell credentials, filesystem secrets: **never** in
  the mobile app. They live only where `claude` itself already expects them
  (its own auth store) or in controller-side env vars.
- `.env.example` documents every controller env var with no real values.
- Structured logs never include secret values (redaction at the logging layer
  for known-sensitive keys).

## Operation risk classes (READ / EXECUTE / WRITE / DESTRUCTIVE)
The controller's REST API never allows arbitrary shell execution. Every
`ClaudeCodeAdapter` operation maps to Claude Code's own `--permission-mode` /
`--allowedTools` / `--restricted` levers (see research/claude-code.md):

| Class | Example | Default permission-mode | Notes |
|---|---|---|---|
| READ | get status, list sessions | n/a (no CC dispatch) | Controller-only, no Claude Code call |
| EXECUTE | send instruction, resume | `plan` or `auto` per session config | never `bypassPermissions` by default |
| WRITE | instruction that edits files | same as EXECUTE, tool-gated via `--allowedTools` | |
| DESTRUCTIVE | instruction implying deletion/force-push/etc. | requires explicit user confirmation surfaced in mobile UI before dispatch | controller must not silently escalate |

`--dangerously-skip-permissions`/`bypassPermissions` is never the default for
any session the controller starts; it is only reachable via an explicit,
logged, user-initiated override path (out of scope to build in Phase 1 unless
requested).

## Threat model notes (Phase 1)
- Primary threat: an unauthenticated device on the LAN reaching the controller
  API — mitigated by pairing/token auth on every non-health endpoint.
- Secondary: a malicious/careless instruction causing destructive local
  changes — mitigated by the risk-class table above, not by the controller
  trying to semantically understand instructions (out of scope for Phase 1;
  no LLM-based instruction vetting).
