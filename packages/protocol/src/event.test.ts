import { describe, expect, it } from "vitest";
import { DOMAIN_EVENT_TYPES, DomainEventSchema } from "./event.js";

describe("DomainEventSchema", () => {
  const valid = {
    id: "evt_1",
    type: "SESSION_STATUS_CHANGED",
    timestamp: new Date().toISOString(),
    sessionId: "session_1",
    projectId: "project_1",
    payload: { previous: "WORKING", current: "COMPLETED" },
    source: "controller",
  };

  it("accepts a valid event", () => {
    expect(DomainEventSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts every declared event type", () => {
    for (const type of DOMAIN_EVENT_TYPES) {
      expect(DomainEventSchema.safeParse({ ...valid, type }).success).toBe(true);
    }
  });

  it("rejects an unknown event type", () => {
    expect(DomainEventSchema.safeParse({ ...valid, type: "SESSION_TELEPORTED" }).success).toBe(
      false
    );
  });

  it("rejects an unknown source", () => {
    expect(DomainEventSchema.safeParse({ ...valid, source: "carrier_pigeon" }).success).toBe(
      false
    );
  });

  it("allows omitting optional correlation ids", () => {
    const { sessionId: _s, projectId: _p, ...rest } = valid;
    expect(DomainEventSchema.safeParse(rest).success).toBe(true);
  });
});
