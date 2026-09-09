import { SESSION_STATUSES } from "@claudeops/protocol";
import { createLogger } from "@claudeops/logging";
import { describe, expect, it, vi } from "vitest";
import { applyTransition } from "./state-machine.js";

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

describe("applyTransition", () => {
  it("applies a valid transition", () => {
    expect(applyTransition("WORKING", "COMPLETED", silentLogger())).toBe("COMPLETED");
  });

  it("rejects an invalid transition and returns the current state unchanged", () => {
    expect(applyTransition("WORKING", "DISCOVERED", silentLogger())).toBe("WORKING");
  });

  it("logs a structured warning on an invalid transition", () => {
    const logger = silentLogger();
    const warnSpy = vi.spyOn(logger, "warn");

    applyTransition("WORKING", "DISCOVERED", logger);

    expect(warnSpy).toHaveBeenCalledWith(
      "rejected invalid session transition",
      expect.objectContaining({
        event: "invalid_session_transition",
        from: "WORKING",
        to: "DISCOVERED",
      })
    );
  });

  it("does not log for a same-state no-op", () => {
    const logger = silentLogger();
    const warnSpy = vi.spyOn(logger, "warn");

    applyTransition("WORKING", "WORKING", logger);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("never throws, for any pair of states", () => {
    const logger = silentLogger();
    for (const from of SESSION_STATUSES) {
      for (const to of SESSION_STATUSES) {
        expect(() => applyTransition(from, to, logger)).not.toThrow();
      }
    }
  });
});
