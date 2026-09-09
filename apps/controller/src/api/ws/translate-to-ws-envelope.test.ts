import { DOMAIN_EVENT_TYPES, WS_PROTOCOL_VERSION, type DomainEvent } from "@claudeops/protocol";
import { describe, expect, it } from "vitest";
import { translateToWsEnvelope } from "./translate-to-ws-envelope.js";

function sampleEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "event_1",
    type: "SESSION_OUTPUT",
    timestamp: new Date().toISOString(),
    sessionId: "session_1",
    projectId: "project_1",
    payload: { output: "hi" },
    source: "controller",
    ...overrides,
  };
}

describe("translateToWsEnvelope", () => {
  it("produces a schema-valid envelope for every DomainEventType", () => {
    for (const type of DOMAIN_EVENT_TYPES) {
      const envelope = translateToWsEnvelope(sampleEvent({ type }));
      expect(envelope.version).toBe(WS_PROTOCOL_VERSION);
      expect(envelope.type).toMatch(/^session\.[a-z_]+$/);
    }
  });

  it("carries sessionId, projectId, timestamp, and payload through", () => {
    const event = sampleEvent();
    const envelope = translateToWsEnvelope(event);

    expect(envelope.sessionId).toBe(event.sessionId);
    expect(envelope.projectId).toBe(event.projectId);
    expect(envelope.timestamp).toBe(event.timestamp);
    expect(envelope.data).toEqual(event.payload);
  });

  it("omits sessionId/projectId when absent on the source event", () => {
    const { sessionId: _s, projectId: _p, ...rest } = sampleEvent();
    const envelope = translateToWsEnvelope(rest as DomainEvent);

    expect(envelope.sessionId).toBeUndefined();
    expect(envelope.projectId).toBeUndefined();
  });
});
