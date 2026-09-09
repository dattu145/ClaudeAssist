# ClaudeOps Architecture (Phase 1)

See also: architecture/system.md, architecture/controller.md, architecture/mobile.md,
architecture/session-model.md, architecture/event-system.md, research/claude-code.md.

## Component map

```
Mobile Client (Expo/RN)  <--HTTP + WS-->  Local ClaudeOps Controller  <--child_process-->  Claude Code CLI
                                                    |
                                                    v
                                           SQLite (repositories)
```

- **Mobile Client**: dashboard UI only in Phase 1. Talks to the controller over the
  local network (or a tunneled address later) via REST for commands/queries and
  WebSocket for realtime events. Never spawns or manages processes itself.
- **Local ClaudeOps Controller**: a Node/TypeScript modular monolith, run as a
  long-running process on the same machine as Claude Code. Owns the Project
  Registry, Session Registry, Task system, Event Bus, REST/WS APIs, and the
  `ClaudeCodeAdapter`. Only this process spawns/manages Claude Code processes.
- **Claude Code Runtime**: the `claude` CLI, invoked via `--bg`, `-p`, `agents
  --json`, etc. (see research/claude-code.md). Never automated via terminal
  scraping.
- **Persistent State**: SQLite via repository interfaces (Project/Session/Task/
  Event/Pairing repositories) so the storage engine can be swapped later.
- **Event/Notification System**: internal typed event bus; `NotificationService`
  abstraction sits on top for future push/voice/WhatsApp fan-out.

## Why this separation (see decisions/ADR-001, ADR-002, ADR-003)

The phone cannot run `claude`; only the controller, running on the dev
machine/server where the projects and credentials live, can. The mobile app is a
thin, swappable client — the same is true of a future voice layer or WhatsApp
bot, which is why commands are modeled as adapter-agnostic REST/WS calls rather
than anything mobile-specific.

## Modular monolith internal layout (controller)

```
apps/controller/src/
  domain/
    project/          # Project entity, ProjectRegistry, ProjectRepository interface
    session/           # ClaudeSession entity, state machine, SessionRegistry
    task/               # Task entity, task state machine
    events/            # DomainEvent types, EventBus interface
  adapters/
    claude-code/        # ClaudeCodeAdapter implementation (child_process + stream-json parsing)
    process-discovery/  # ProcessDiscoveryService (platform-specific impls)
    persistence/sqlite/  # SQLite repository implementations + migrations
    notification/        # ConsoleNotificationService (Phase 1), interface for future providers
  api/
    http/               # REST routes, Zod schemas, controllers
    ws/                 # WebSocket server, versioned protocol
  orchestration/
    command-router/     # CommandRouter, IntentResolver interface (no LLM impl yet)
    reconciliation/     # startup reconciliation logic
  security/
    pairing/            # pairing code/token issuance and verification
    auth-middleware/
  app.ts / server.ts / index.ts
```

Business logic in `domain/` and `orchestration/` never imports SQLite or the
`claude` CLI directly — only through the interfaces in `adapters/`.

## Data flow: "send instruction" (representative path, all sources)

1. Mobile UI / future voice / future WhatsApp calls `POST /sessions/:id/instructions`
   (or, later, is translated into that same call by `CommandRouter` +
   `IntentResolver`).
2. Controller validates with Zod, creates a `Task` (`QUEUED`), emits
   `SESSION_TASK_STARTED`.
3. `ClaudeCodeAdapter.sendInstruction` spawns `claude -p --resume <id>
   --output-format stream-json`.
4. stdout lines are parsed into domain events (`SESSION_OUTPUT`,
   `SESSION_TASK_PROGRESS`, `SESSION_WAITING_FOR_PERMISSION`, ...), persisted via
   `EventRepository`, and broadcast over the WS protocol.
5. On process exit, task/session state is finalized (`COMPLETED`/`FAILED`) and a
   domain event fires; `NotificationService.notify()` is called.

## Non-goals for Phase 1 (explicitly deferred)

Voice, Bordio, WhatsApp, multi-user permissions, LLM-driven `IntentResolver`,
attaching to manually-started interactive sessions (see research/claude-code.md
limitation), Postgres migration, microservices.
