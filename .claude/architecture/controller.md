# Controller

Node.js + TypeScript (strict) modular monolith, packaged at `apps/controller`.
Runs as a long-lived daemon on the same host as Claude Code.

## Responsibilities
Project Registry, Session Registry, Task system, Event Bus + persistence, REST
API, WebSocket API, `ClaudeCodeAdapter`, `ProcessDiscoveryService`, pairing/auth,
`NotificationService`, `CommandRouter`/`IntentResolver` scaffolding.

## Runtime shape
- HTTP server (REST) + WS server, same process, same port where practical.
- SQLite file under a configurable data dir (default `~/.claudeops/data.db`),
  accessed only through repository interfaces (`packages/shared` defines the
  interfaces; `apps/controller/src/adapters/persistence/sqlite` implements
  them) so Postgres can replace it later without touching domain code.
- Structured JSON logging (`packages/logging`) to stdout + rotating file,
  documented rotation strategy (size/time-based via a standard lib, not
  hand-rolled).
- Graceful shutdown on SIGINT/SIGTERM: stop accepting new HTTP/WS connections,
  let in-flight instruction dispatches finish or time out, close DB cleanly.
- Startup reconciliation (see architecture/session-model.md) runs before the
  HTTP/WS servers start accepting traffic.
- `/health` endpoint aggregates: DB reachable, `claude doctor` result, event
  bus alive, uptime, last reconciliation time.

## Config
`packages/config` — Zod-validated env schema, loaded once at startup, no
scattered `process.env` reads elsewhere. `.env.example` documents every var.
