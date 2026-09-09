import type { DomainEvent } from "@claudeops/protocol";
import type { Logger } from "@claudeops/logging";
import type { Unsubscribe } from "../session/adapter.js";

export type EventHandler = (event: DomainEvent) => void;

export interface EventBus {
  publish(event: DomainEvent): void;
  subscribe(handler: EventHandler): Unsubscribe;
}

/**
 * Synchronous, unbounded, in-process fan-out (see .claude/architecture/
 * event-system.md — "dumb fan-out only"). A throwing subscriber is caught
 * and logged so it can never crash publish() or block other subscribers.
 */
export class InProcessEventBus implements EventBus {
  private readonly handlers = new Set<EventHandler>();

  constructor(private readonly logger: Logger) {}

  publish(event: DomainEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        this.logger.error("event handler threw", {
          eventType: event.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  subscribe(handler: EventHandler): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
