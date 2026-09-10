import type { Logger } from "@claudeops/logging";
import type { Notification, NotificationService } from "../../domain/notification/service.js";

/**
 * Phase 1's only NotificationService: logs through the same structured
 * JSON stdout every other component already uses (packages/logging),
 * tagged `notification: true` so it's filterable from ordinary
 * operational log lines. A future push/WhatsApp/voice provider is a new
 * adapter behind the same interface, not a rewrite of this one (ADR-002).
 */
export class ConsoleNotificationService implements NotificationService {
  constructor(private readonly logger: Logger) {}

  notify(notification: Notification): Promise<void> {
    this.logger.info(notification.title, {
      notification: true,
      body: notification.body,
      eventId: notification.event.id,
      eventType: notification.event.type,
      sessionId: notification.event.sessionId,
      projectId: notification.event.projectId,
    });
    return Promise.resolve();
  }
}
