import type { DomainEvent, DomainEventType } from "@claudeops/protocol";
import type { Notification } from "./service.js";

/**
 * Which events are worth interrupting the user for. `architecture/
 * event-system.md` names SESSION_COMPLETED/FAILED/WAITING_FOR_* as its
 * examples; SESSION_ERROR is added here (same "something needs you"
 * bucket as FAILED, even though no adapter event maps to it yet — see
 * translate-session-event.ts). Everything else is purely informational
 * and already reaches the mobile app live over WS — a notification is
 * for "come look", not a duplicate of the activity feed.
 */
const NOTIFY_WORTHY_EVENT_TYPES: ReadonlySet<DomainEventType> = new Set([
  "SESSION_COMPLETED",
  "SESSION_FAILED",
  "SESSION_WAITING_FOR_INPUT",
  "SESSION_WAITING_FOR_PERMISSION",
  "SESSION_ERROR",
]);

const TITLES: Partial<Record<DomainEventType, string>> = {
  SESSION_COMPLETED: "Session completed",
  SESSION_FAILED: "Session failed",
  SESSION_WAITING_FOR_INPUT: "Session needs input",
  SESSION_WAITING_FOR_PERMISSION: "Session needs permission",
  SESSION_ERROR: "Session error",
};

/** Returns the Notification to send, or null if this event doesn't
 * warrant one. Pure — no I/O, easy to exhaustively test per event type. */
export function shouldNotify(event: DomainEvent): Notification | null {
  if (!NOTIFY_WORTHY_EVENT_TYPES.has(event.type)) {
    return null;
  }

  const title = TITLES[event.type] ?? event.type;
  const body = event.sessionId ? `Session ${event.sessionId}` : "See the activity feed for details.";

  return { title, body, event };
}
