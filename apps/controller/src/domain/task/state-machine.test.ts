import { TASK_STATUSES } from "@claudeops/protocol";
import { createLogger } from "@claudeops/logging";
import { describe, expect, it, vi } from "vitest";
import { applyTransition } from "./state-machine.js";

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

describe("applyTransition (task)", () => {
  it("applies a valid transition", () => {
    expect(applyTransition("RUNNING", "COMPLETED", silentLogger())).toBe("COMPLETED");
  });

  it("rejects an invalid transition and returns the current state unchanged", () => {
    expect(applyTransition("RUNNING", "CANCELLED", silentLogger())).toBe("RUNNING");
  });

  it("logs a structured warning on an invalid transition", () => {
    const logger = silentLogger();
    const warnSpy = vi.spyOn(logger, "warn");

    applyTransition("COMPLETED", "RUNNING", logger);

    expect(warnSpy).toHaveBeenCalledWith(
      "rejected invalid task transition",
      expect.objectContaining({ event: "invalid_task_transition", from: "COMPLETED", to: "RUNNING" })
    );
  });

  it("never throws, for any pair of states", () => {
    const logger = silentLogger();
    for (const from of TASK_STATUSES) {
      for (const to of TASK_STATUSES) {
        expect(() => applyTransition(from, to, logger)).not.toThrow();
      }
    }
  });
});
