import { describe, expect, it } from "vitest";
import { DOMAIN_EVENT_TYPES } from "./event.js";
import { DOMAIN_EVENT_TO_WS_TYPE, WS_PROTOCOL_VERSION, WsEnvelopeSchema } from "./ws-protocol.js";

describe("DOMAIN_EVENT_TO_WS_TYPE", () => {
  it("maps every domain event type to a dot-notation wire type", () => {
    for (const type of DOMAIN_EVENT_TYPES) {
      expect(DOMAIN_EVENT_TO_WS_TYPE[type]).toMatch(/^session\.[a-z_]+$/);
    }
  });
});

describe("WsEnvelopeSchema", () => {
  const valid = {
    version: WS_PROTOCOL_VERSION,
    type: "session.status_changed",
    timestamp: new Date().toISOString(),
    sessionId: "session_1",
    projectId: "project_1",
    data: { previous: "working", current: "completed" },
  };

  it("accepts a valid envelope", () => {
    expect(WsEnvelopeSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a wrong protocol version", () => {
    expect(WsEnvelopeSchema.safeParse({ ...valid, version: 2 }).success).toBe(false);
  });

  it("rejects an unmapped wire type", () => {
    expect(WsEnvelopeSchema.safeParse({ ...valid, type: "session.exploded" }).success).toBe(
      false
    );
  });
});
