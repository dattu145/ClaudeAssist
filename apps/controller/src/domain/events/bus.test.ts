import { createLogger } from "@claudeops/logging";
import type { DomainEvent } from "@claudeops/protocol";
import { describe, expect, it } from "vitest";
import { InProcessEventBus } from "./bus.js";

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

function sampleEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "event_1",
    type: "SESSION_OUTPUT",
    timestamp: new Date().toISOString(),
    payload: { output: "hi" },
    source: "controller",
    ...overrides,
  };
}

describe("InProcessEventBus", () => {
  it("delivers a published event to all subscribers", () => {
    const bus = new InProcessEventBus(silentLogger());
    const a: DomainEvent[] = [];
    const b: DomainEvent[] = [];
    bus.subscribe((e) => a.push(e));
    bus.subscribe((e) => b.push(e));

    bus.publish(sampleEvent());

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("stops delivering to an unsubscribed handler", () => {
    const bus = new InProcessEventBus(silentLogger());
    const received: DomainEvent[] = [];
    const unsubscribe = bus.subscribe((e) => received.push(e));
    unsubscribe();

    bus.publish(sampleEvent());

    expect(received).toHaveLength(0);
  });

  it("does not let a throwing handler crash publish or block other handlers", () => {
    const bus = new InProcessEventBus(silentLogger());
    const received: DomainEvent[] = [];
    bus.subscribe(() => {
      throw new Error("boom");
    });
    bus.subscribe((e) => received.push(e));

    expect(() => bus.publish(sampleEvent())).not.toThrow();
    expect(received).toHaveLength(1);
  });
});
