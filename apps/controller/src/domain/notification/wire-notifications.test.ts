import { createLogger } from "@claudeops/logging";
import type { DomainEvent } from "@claudeops/protocol";
import { describe, expect, it, vi } from "vitest";
import { InProcessEventBus } from "../events/bus.js";
import type { Notification, NotificationService } from "./service.js";
import { wireNotifications } from "./wire-notifications.js";

function sampleEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "event_1",
    type: "SESSION_OUTPUT",
    timestamp: new Date().toISOString(),
    sessionId: "session_1",
    payload: {},
    source: "controller",
    ...overrides,
  };
}

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

describe("wireNotifications", () => {
  it("notifies for a notify-worthy event", async () => {
    const bus = new InProcessEventBus(silentLogger());
    const sent: Notification[] = [];
    const service: NotificationService = {
      notify: (n) => {
        sent.push(n);
        return Promise.resolve();
      },
    };
    wireNotifications(bus, service, silentLogger());

    bus.publish(sampleEvent({ type: "SESSION_COMPLETED" }));
    await Promise.resolve();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.event.type).toBe("SESSION_COMPLETED");
  });

  it("does not notify for a purely informational event", async () => {
    const bus = new InProcessEventBus(silentLogger());
    const sent: Notification[] = [];
    const service: NotificationService = {
      notify: (n) => {
        sent.push(n);
        return Promise.resolve();
      },
    };
    wireNotifications(bus, service, silentLogger());

    bus.publish(sampleEvent({ type: "SESSION_OUTPUT" }));
    await Promise.resolve();

    expect(sent).toHaveLength(0);
  });

  it("logs, but does not throw, when notify() fails", async () => {
    const bus = new InProcessEventBus(silentLogger());
    const service: NotificationService = {
      notify: () => Promise.reject(new Error("no network")),
    };
    const logger = silentLogger();
    const errorSpy = vi.spyOn(logger, "error");
    wireNotifications(bus, service, logger);

    expect(() => bus.publish(sampleEvent({ type: "SESSION_FAILED" }))).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));

    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns an unsubscribe function", async () => {
    const bus = new InProcessEventBus(silentLogger());
    const sent: Notification[] = [];
    const service: NotificationService = {
      notify: (n) => {
        sent.push(n);
        return Promise.resolve();
      },
    };
    const unsubscribe = wireNotifications(bus, service, silentLogger());
    unsubscribe();

    bus.publish(sampleEvent({ type: "SESSION_COMPLETED" }));
    await Promise.resolve();

    expect(sent).toHaveLength(0);
  });
});
