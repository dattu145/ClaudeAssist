import { createLogger } from "@claudeops/logging";
import { describe, expect, it } from "vitest";
import { createSession, transitionSession } from "./entity.js";

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

describe("createSession", () => {
  it("creates a schema-valid session in the DISCOVERED state", () => {
    const session = createSession({ projectId: "project_1" });

    expect(session.status).toBe("DISCOVERED");
    expect(session.projectId).toBe("project_1");
    expect(session.claudeSessionId).toBeNull();
    expect(session.id).toMatch(/^session_/);
    expect(session.startedAt).toBe(session.lastActivityAt);
  });

  it("accepts an explicit claudeSessionId", () => {
    const session = createSession({ projectId: "project_1", claudeSessionId: "claude-abc" });
    expect(session.claudeSessionId).toBe("claude-abc");
  });
});

describe("transitionSession", () => {
  it("applies a valid transition and bumps lastActivityAt", async () => {
    const original = createSession({ projectId: "project_1" });
    await new Promise((r) => setTimeout(r, 5));

    const next = transitionSession(original, "STARTING", silentLogger());

    expect(next.status).toBe("STARTING");
    expect(next.lastActivityAt).not.toBe(original.lastActivityAt);
  });

  it("does not mutate the original session object", () => {
    const original = createSession({ projectId: "project_1" });
    const originalCopy = { ...original };

    transitionSession(original, "STARTING", silentLogger());

    expect(original).toEqual(originalCopy);
  });

  it("on an invalid transition, returns a session equal to the original", () => {
    const original = createSession({ projectId: "project_1" });

    // DISCOVERED -> COMPLETED is not a valid transition.
    const next = transitionSession(original, "COMPLETED", silentLogger());

    expect(next).toEqual(original);
  });

  it("preserves unrelated fields across a valid transition", () => {
    const original = { ...createSession({ projectId: "project_1" }), currentTask: "fix bug" };

    const next = transitionSession(original, "STARTING", silentLogger());

    expect(next.currentTask).toBe("fix bug");
    expect(next.projectId).toBe("project_1");
    expect(next.id).toBe(original.id);
  });
});
