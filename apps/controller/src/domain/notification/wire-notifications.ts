import type { Logger } from "@claudeops/logging";
import type { EventBus } from "../events/bus.js";
import type { Unsubscribe } from "../session/adapter.js";
import { shouldNotify } from "./should-notify.js";
import type { NotificationService } from "./service.js";

/** Subscribes `notificationService` to `bus`, same shape as
 * `wireEventPersistence` — a `notify()` failure is logged, never thrown,
 * so it can't crash the publisher or block the other subscribers
 * (persistence, WS broadcast). */
export function wireNotifications(
  bus: EventBus,
  notificationService: NotificationService,
  logger: Logger
): Unsubscribe {
  return bus.subscribe((event) => {
    const notification = shouldNotify(event);
    if (!notification) {
      return;
    }
    notificationService.notify(notification).catch((err: unknown) => {
      logger.error("failed to send notification", {
        eventId: event.id,
        eventType: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });
}
