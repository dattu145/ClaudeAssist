import type { Logger } from "@claudeops/logging";
import type { EventBus } from "./bus.js";
import type { EventRepository } from "./repository.js";
import type { Unsubscribe } from "../session/adapter.js";

/** Subscribes `repository` to `bus` so every published event is persisted.
 * A persistence failure is logged, never thrown — it must not crash the
 * publisher or block other subscribers. */
export function wireEventPersistence(
  bus: EventBus,
  repository: EventRepository,
  logger: Logger
): Unsubscribe {
  return bus.subscribe((event) => {
    repository.create(event).catch((err: unknown) => {
      logger.error("failed to persist domain event", {
        eventId: event.id,
        eventType: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });
}
