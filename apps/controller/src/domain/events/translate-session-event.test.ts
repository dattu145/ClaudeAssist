import { describe, expect, it } from "vitest";
import type { SessionAdapterEvent } from "../session/adapter.js";
import { translateSessionEvent } from "./translate-session-event.js";

const SESSION = { id: "session_1", projectId: "project_1" };

function baseEvent(overrides: Partial<SessionAdapterEvent>): SessionAdapterEvent {
  return {
    type: "output",
    sessionId: SESSION.id,
    timestamp: new Date().toISOString(),
    data: {},
    ...overrides,
  };
}

describe("translateSessionEvent", () => {
  it("maps output -> SESSION_OUTPUT", () => {
    const event = translateSessionEvent(SESSION, baseEvent({ type: "output", data: { output: "hi" } }));
    expect(event.type).toBe("SESSION_OUTPUT");
    expect(event.sessionId).toBe(SESSION.id);
    expect(event.projectId).toBe(SESSION.projectId);
    expect(event.source).toBe("controller");
    expect(event.payload).toEqual({ output: "hi" });
  });

  it("maps completed/failed/stopped/disconnected directly", () => {
    expect(translateSessionEvent(SESSION, baseEvent({ type: "completed" })).type).toBe(
      "SESSION_COMPLETED"
    );
    expect(translateSessionEvent(SESSION, baseEvent({ type: "failed" })).type).toBe("SESSION_FAILED");
    expect(translateSessionEvent(SESSION, baseEvent({ type: "stopped" })).type).toBe(
      "SESSION_STOPPED"
    );
    expect(translateSessionEvent(SESSION, baseEvent({ type: "disconnected" })).type).toBe(
      "SESSION_DISCONNECTED"
    );
  });

  it("maps status_changed -> SESSION_STARTED when current is STARTING", () => {
    const event = translateSessionEvent(
      SESSION,
      baseEvent({ type: "status_changed", data: { previous: "DISCOVERED", current: "STARTING" } })
    );
    expect(event.type).toBe("SESSION_STARTED");
  });

  it("maps status_changed -> SESSION_WAITING_FOR_INPUT / SESSION_WAITING_FOR_PERMISSION", () => {
    expect(
      translateSessionEvent(
        SESSION,
        baseEvent({ type: "status_changed", data: { previous: "WORKING", current: "WAITING_FOR_INPUT" } })
      ).type
    ).toBe("SESSION_WAITING_FOR_INPUT");

    expect(
      translateSessionEvent(
        SESSION,
        baseEvent({
          type: "status_changed",
          data: { previous: "WORKING", current: "WAITING_FOR_PERMISSION" },
        })
      ).type
    ).toBe("SESSION_WAITING_FOR_PERMISSION");
  });

  it("falls back to generic SESSION_STATUS_CHANGED for other status transitions", () => {
    const event = translateSessionEvent(
      SESSION,
      baseEvent({ type: "status_changed", data: { previous: "STARTING", current: "IDLE" } })
    );
    expect(event.type).toBe("SESSION_STATUS_CHANGED");
  });

  it("falls back to generic SESSION_STATUS_CHANGED when data has no recognizable current", () => {
    const event = translateSessionEvent(
      SESSION,
      baseEvent({ type: "status_changed", data: "not an object" })
    );
    expect(event.type).toBe("SESSION_STATUS_CHANGED");
  });

  it("produces a schema-valid event with a unique id per call", () => {
    const a = translateSessionEvent(SESSION, baseEvent({ type: "output" }));
    const b = translateSessionEvent(SESSION, baseEvent({ type: "output" }));
    expect(a.id).not.toBe(b.id);
  });
});
