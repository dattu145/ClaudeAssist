# Security

## Pairing (mobile <-> controller auth)
- Controller generates a short-lived pairing code on startup (printed to
  controller stdout/log), plus a `PairingRepository`-backed record.
- Mobile app exchanges the pairing code for a long-lived auth token over the
  local network on first connect; token stored via Expo SecureStore.
- All REST/WS requests after pairing require the token (bearer header /
  WS handshake auth). Unauthenticated requests to anything beyond
  `GET /health` and the pairing endpoint are rejected.
- Pairing tokens are revocable from controller-side settings (future mobile
  Settings screen action).

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
