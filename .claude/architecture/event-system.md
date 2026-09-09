# Event System

## Domain event envelope (internal, persisted)

```ts
interface DomainEvent<T = unknown> {
  id: string;            // ULID
  type: DomainEventType; // typed union, see below
  timestamp: string;     // ISO-8601 UTC
  projectId?: string;
  sessionId?: string;
  taskId?: string;
  payload: T;
  source: "controller" | "mobile" | "voice" | "whatsapp" | "system";
}
```

## Event types (Phase 1)

`SESSION_DISCOVERED, SESSION_STARTED, SESSION_STATUS_CHANGED, SESSION_OUTPUT,
SESSION_TASK_STARTED, SESSION_TASK_PROGRESS, SESSION_WAITING_FOR_INPUT,
SESSION_WAITING_FOR_PERMISSION, SESSION_COMPLETED, SESSION_FAILED,
SESSION_STOPPED, SESSION_DISCONNECTED, SESSION_ERROR`

## Flow

`ClaudeCodeAdapter` / `ProcessDiscoveryService` / reconciliation logic emit
domain events onto an in-process `EventBus` (typed pub/sub, no external broker
in Phase 1 — see decisions/ADR-002). Three consumers subscribe:

1. `EventRepository` — persists every event to SQLite (append-only).
2. WS API — maps `DomainEvent` to the versioned wire protocol
   (`architecture/mobile.md`) and broadcasts to subscribed mobile clients.
3. `NotificationService` — decides whether an event warrants a notification
   (e.g. `SESSION_COMPLETED`, `SESSION_FAILED`, `SESSION_WAITING_FOR_*`).

The bus is intentionally dumb (fan-out only); ordering/business rules live in
the domain layer that emits events, not in the bus.
