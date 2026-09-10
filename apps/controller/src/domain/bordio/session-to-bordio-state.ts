import type { DomainEventType } from "@claudeops/protocol";

/**
 * Bordio task-status definitions only carry a universal `state: "open" |
 * "closed"` (research/bordio.md) — the only signal that means the same
 * thing in every workspace regardless of what the user has renamed their
 * statuses to. Only covers the notify-worthy event types
 * (domain/notification/should-notify.ts) — nothing else ever reaches a
 * NotificationService.
 */
const SESSION_EVENT_TO_BORDIO_STATE: Partial<Record<DomainEventType, "open" | "closed">> = {
  SESSION_COMPLETED: "closed",
  SESSION_FAILED: "closed",
  SESSION_ERROR: "closed",
  SESSION_WAITING_FOR_INPUT: "open",
  SESSION_WAITING_FOR_PERMISSION: "open",
};

/** Returns null for an event type this mapping has no opinion on — never
 * reached in practice since only notify-worthy events reach a
 * NotificationService, but a caller should still handle it explicitly
 * rather than assume a default. */
export function sessionEventToBordioState(eventType: DomainEventType): "open" | "closed" | null {
  return SESSION_EVENT_TO_BORDIO_STATE[eventType] ?? null;
}
