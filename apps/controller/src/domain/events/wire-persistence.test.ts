import { createLogger } from "@claudeops/logging";
import type { DomainEvent } from "@claudeops/protocol";
import { describe, expect, it, vi } from "vitest";
import { InProcessEventBus } from "./bus.js";
import type { EventRepository } from "./repository.js";
import { wireEventPersistence } from "./wire-persistence.js";

function sampleEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "event_1",
    type: "SESSION_OUTPUT",
    timestamp: new Date().toISOString(),
    payload: {},
    source: "controller",
    ...overrides,
  };
}

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

describe("wireEventPersistence", () => {
  it("persists every published event", async () => {
    const bus = new InProcessEventBus(silentLogger());
    const created: DomainEvent[] = [];
    const repository: EventRepository = {
      create: (event) => {
        created.push(event);
        return Promise.resolve();
      },
      listBySession: () => Promise.resolve([]),
    };
    wireEventPersistence(bus, repository, silentLogger());

    bus.publish(sampleEvent());
    await Promise.resolve(); // let the .catch microtask settle

    expect(created).toHaveLength(1);
  });

  it("logs, but does not throw, when persistence fails", async () => {
    const bus = new InProcessEventBus(silentLogger());
    const repository: EventRepository = {
      create: () => Promise.reject(new Error("disk full")),
      listBySession: () => Promise.resolve([]),
    };
    const logger = silentLogger();
    const errorSpy = vi.spyOn(logger, "error");
    wireEventPersistence(bus, repository, logger);

    expect(() => bus.publish(sampleEvent())).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));

    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns an unsubscribe function", async () => {
    const bus = new InProcessEventBus(silentLogger());
    const created: DomainEvent[] = [];
    const repository: EventRepository = {
      create: (event) => {
        created.push(event);
        return Promise.resolve();
      },
      listBySession: () => Promise.resolve([]),
    };
    const unsubscribe = wireEventPersistence(bus, repository, silentLogger());
    unsubscribe();

    bus.publish(sampleEvent());
    await Promise.resolve();

    expect(created).toHaveLength(0);
  });
});
