import { DOMAIN_EVENT_TYPES, type DomainEvent, type DomainEventType } from "@claudeops/protocol";
import { describe, expect, it } from "vitest";
import { shouldNotify } from "./should-notify.js";

function sampleEvent(type: DomainEventType, overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "event_1",
    type,
    timestamp: new Date().toISOString(),
    sessionId: "session_1",
    payload: {},
    source: "controller",
    ...overrides,
  };
}

const NOTIFY_WORTHY: DomainEventType[] = [
  "SESSION_COMPLETED",
  "SESSION_FAILED",
  "SESSION_WAITING_FOR_INPUT",
  "SESSION_WAITING_FOR_PERMISSION",
  "SESSION_ERROR",
];

describe("shouldNotify", () => {
  it.each(NOTIFY_WORTHY)("returns a Notification for %s", (type) => {
    const event = sampleEvent(type);
    const result = shouldNotify(event);
    expect(result).not.toBeNull();
    expect(result?.event).toBe(event);
    expect(result?.title.length).toBeGreaterThan(0);
    expect(result?.body.length).toBeGreaterThan(0);
  });

  it.each(DOMAIN_EVENT_TYPES.filter((t) => !NOTIFY_WORTHY.includes(t)))(
    "returns null for %s (purely informational)",
    (type) => {
      expect(shouldNotify(sampleEvent(type))).toBeNull();
    }
  );

  it("falls back to a generic body when the event has no sessionId", () => {
    const event = sampleEvent("SESSION_FAILED", { sessionId: undefined });
    const result = shouldNotify(event);
    expect(result?.body).toBe("See the activity feed for details.");
  });

  it("covers every DomainEventType between the two lists above", () => {
    expect(NOTIFY_WORTHY.length + DOMAIN_EVENT_TYPES.filter((t) => !NOTIFY_WORTHY.includes(t)).length).toBe(
      DOMAIN_EVENT_TYPES.length
    );
  });
});
