# Page 19: NotificationService (Console) + domain-event wiring

# Objective
The third consumer of the `EventBus` promised by
`architecture/event-system.md`: a `NotificationService` interface with a
Phase 1 `ConsoleNotificationService` implementation, wired to the bus
alongside `EventRepository` (page10) so it fires automatically for real
sessions — not a standalone piece waiting for a future page to consume it.

# Why
`architecture/event-system.md` names three bus subscribers; two exist
(`EventRepository`, the WS API). The third — deciding which events are
notification-worthy and doing something about it — has been a documented
gap since page10. `ARCHITECTURE.md`'s directory layout and ADR-002 both
already name `ConsoleNotificationService` as the Phase 1 implementation
behind a provider-agnostic interface, specifically so a future push/
WhatsApp/voice notifier is a new adapter, not a rewrite (ADR-002's whole
point: draw the interface now, defer the distributed-systems cost).

# Design
- `domain/notification/service.ts` — the interface:
  ```ts
  export interface Notification {
    title: string;
    body: string;
    event: DomainEvent;
  }
  export interface NotificationService {
    notify(notification: Notification): Promise<void>;
  }
  ```
  A failing `notify()` must never propagate — same contract as
  `EventRepository.create()` in `wireEventPersistence`.
- `domain/notification/should-notify.ts` — a pure function deciding
  notification-worthiness and building the `Notification` (title/body) for
  an event. `event-system.md` names `SESSION_COMPLETED`, `SESSION_FAILED`,
  `SESSION_WAITING_FOR_INPUT`, `SESSION_WAITING_FOR_PERMISSION` as its
  examples ("e.g.") of what warrants a notification — this page also
  includes `SESSION_ERROR` (a real problem the user needs to see, same
  bucket as `SESSION_FAILED`) and excludes the purely informational types
  (`SESSION_STARTED`, `SESSION_OUTPUT`, `SESSION_TASK_STARTED`,
  `SESSION_TASK_PROGRESS`, `SESSION_DISCOVERED`, `SESSION_DISCONNECTED`,
  `SESSION_STOPPED`, `SESSION_STATUS_CHANGED`) — those already reach the
  mobile app live over WS; a notification is for "come look, something
  needs you," not everything.
- `adapters/notification/console-notification-service.ts` —
  `ConsoleNotificationService implements NotificationService`, logging
  each notification via the injected `Logger` (matches how every other
  Phase 1 output already reaches the console — `packages/logging`'s
  structured JSON stdout) tagged `notification: true` so it's filterable
  from ordinary operational log lines, distinct from a raw `console.log`.
- `domain/notification/wire-notifications.ts` — `wireNotifications(bus,
  notificationService, logger)`, same shape as page10's
  `wireEventPersistence`: subscribes to the bus, runs `shouldNotify`,
  calls `notify()` for a match, catches and logs any rejection.
- `lifecycle.ts` — constructs `ConsoleNotificationService` and calls
  `wireNotifications` right after `wireEventPersistence`, so it's live for
  every controller start, same as the other two subscribers.

# Implementation
1. `domain/notification/service.ts` (interface + types).
2. `domain/notification/should-notify.ts` (+ test — every event type
   exercised, notify-worthy and not).
3. `adapters/notification/console-notification-service.ts` (+ test).
4. `domain/notification/wire-notifications.ts` (+ test — matching event
   triggers `notify()`; non-matching doesn't; a rejected `notify()` is
   caught and logged, not thrown, mirroring `wire-persistence.test.ts`).
5. `lifecycle.ts` wiring.

# Files Changed
New: `apps/controller/src/domain/notification/{service,should-notify,
wire-notifications}.ts` (+ their `.test.ts`),
`apps/controller/src/adapters/notification/console-notification-service.ts`
(+ its `.test.ts`). Modified: `apps/controller/src/lifecycle.ts`.

# Tests
Unit tests per file above. Real end-to-end verification: the same
`startController()`-backed manual-check pattern used since page16/page18
— start a session with `FakeClaudeSessionAdapter`, drive it to
`COMPLETED`/`FAILED`, confirm a notification log line with
`notification: true` actually appears, not just that `notify()` was
called in isolation. `npm run typecheck`, `npm run lint`, `npm test` green
from root.

# Acceptance Criteria
- [x] `NotificationService` interface + `ConsoleNotificationService` exist
      per `ARCHITECTURE.md`'s directory layout.
- [x] `shouldNotify` correctly classifies every `DomainEventType`
      (verified by a test per type, not just the notify-worthy ones).
- [x] `wireNotifications` is live in `lifecycle.ts` — a real controller
      run produces a notification log line for a real session reaching
      `COMPLETED` and `FAILED` (verified by manual check, using
      `FakeClaudeSessionAdapter.queueInstructionOutcome` for the latter);
      `WAITING_FOR_INPUT`/`WAITING_FOR_PERMISSION`/`ERROR` verified by unit
      test only — no adapter path in this repo drives a fake session to
      those outcomes.
- [x] A `notify()` failure never crashes the bus or blocks the other two
      subscribers (persistence, WS broadcast).
- [x] All tests pass; typecheck and lint clean.
- [x] `.claude/PROGRESS.md` updated.

# Risks
- "Console" notifications have no user-facing surface yet (no mobile push,
  no OS notification) — this page only builds the abstraction and its
  Phase 1 stub, per the roadmap; a real delivery channel is future-phase
  scope (ADR-002, `ARCHITECTURE.md` non-goals).
- The notify-worthy event set is a judgment call beyond `event-system.md`'s
  explicit examples (adding `SESSION_ERROR`) — documented above rather than
  silently decided, so it's revisitable if the user wants a different set.

# Completion Checklist
- [x] All Acceptance Criteria checked
- [x] `.claude/CHANGELOG.md` entry added
- [x] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page20.md` written (CommandRouter/IntentResolver
      interfaces) before starting page20
