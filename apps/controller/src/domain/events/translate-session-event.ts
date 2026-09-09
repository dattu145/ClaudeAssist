import { generateId } from "@claudeops/shared";
import { DomainEventSchema, type DomainEvent, type DomainEventType } from "@claudeops/protocol";
import type { SessionAdapterEvent } from "../session/adapter.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Maps a raw SessionAdapterEvent to a DomainEventType. `status_changed`
 * inspects `data.current` for a more specific type where directly
 * derivable; everything else is a direct 1:1 mapping. SESSION_DISCOVERED
 * (page16), SESSION_TASK_STARTED/SESSION_TASK_PROGRESS (page11), and
 * SESSION_ERROR (reserved, no adapter event distinguishes an
 * infrastructure failure from a domain one yet) are not reachable here —
 * not forced, not guessed at.
 */
function mapEventType(event: SessionAdapterEvent): DomainEventType {
  if (event.type === "status_changed") {
    const current = isRecord(event.data) && typeof event.data.current === "string"
      ? event.data.current
      : undefined;
    switch (current) {
      case "STARTING":
        return "SESSION_STARTED";
      case "WAITING_FOR_INPUT":
        return "SESSION_WAITING_FOR_INPUT";
      case "WAITING_FOR_PERMISSION":
        return "SESSION_WAITING_FOR_PERMISSION";
      default:
        return "SESSION_STATUS_CHANGED";
    }
  }

  switch (event.type) {
    case "output":
      return "SESSION_OUTPUT";
    case "completed":
      return "SESSION_COMPLETED";
    case "failed":
      return "SESSION_FAILED";
    case "stopped":
      return "SESSION_STOPPED";
    case "disconnected":
      return "SESSION_DISCONNECTED";
  }
}

export function translateSessionEvent(
  session: { id: string; projectId: string },
  event: SessionAdapterEvent
): DomainEvent {
  return DomainEventSchema.parse({
    id: generateId("event"),
    type: mapEventType(event),
    timestamp: event.timestamp,
    sessionId: session.id,
    projectId: session.projectId,
    payload: event.data,
    source: "controller",
  });
}
