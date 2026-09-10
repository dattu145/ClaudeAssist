import type { DomainEvent } from "@claudeops/protocol";

export interface Notification {
  title: string;
  body: string;
  event: DomainEvent;
}

/**
 * Phase 1 has one implementation (`ConsoleNotificationService`), but the
 * interface is drawn now — same reasoning as `ClaudeSessionAdapter` and
 * every repository — so a future push/WhatsApp/voice notifier is a new
 * adapter, not a rewrite (ADR-002).
 */
export interface NotificationService {
  notify(notification: Notification): Promise<void>;
}
