import type { DomainEventType } from "@claudeops/protocol";
import { describe, expect, it } from "vitest";
import { sessionEventToBordioState } from "./session-to-bordio-state.js";

describe("sessionEventToBordioState", () => {
  it.each<[DomainEventType, "open" | "closed"]>([
    ["SESSION_COMPLETED", "closed"],
    ["SESSION_FAILED", "closed"],
    ["SESSION_ERROR", "closed"],
    ["SESSION_WAITING_FOR_INPUT", "open"],
    ["SESSION_WAITING_FOR_PERMISSION", "open"],
  ])("maps %s to %s", (eventType, expected) => {
    expect(sessionEventToBordioState(eventType)).toBe(expected);
  });

  it("returns null for an event type it has no opinion on", () => {
    expect(sessionEventToBordioState("SESSION_OUTPUT")).toBeNull();
  });
});
