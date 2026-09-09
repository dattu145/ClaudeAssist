import { createLogger } from "@claudeops/logging";
import { describe, expect, it } from "vitest";
import { createTask, transitionTask } from "./entity.js";

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

describe("createTask", () => {
  it("creates a schema-valid task in the QUEUED state", () => {
    const task = createTask({ projectId: "project_1", sessionId: "session_1", instruction: "fix it" });

    expect(task.status).toBe("QUEUED");
    expect(task.startedAt).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(task.id).toMatch(/^task_/);
  });
});

describe("transitionTask", () => {
  const base = () =>
    createTask({ projectId: "project_1", sessionId: "session_1", instruction: "fix it" });

  it("sets startedAt the first time a task reaches RUNNING", () => {
    let task = base();
    task = transitionTask(task, "DISPATCHING", silentLogger());
    expect(task.startedAt).toBeNull();

    task = transitionTask(task, "RUNNING", silentLogger());
    expect(task.startedAt).not.toBeNull();
  });

  it("does not overwrite startedAt on a later transition back through RUNNING", async () => {
    let task = base();
    task = transitionTask(task, "DISPATCHING", silentLogger());
    task = transitionTask(task, "RUNNING", silentLogger());
    const firstStartedAt = task.startedAt;

    task = transitionTask(task, "WAITING", silentLogger());
    await new Promise((r) => setTimeout(r, 5));
    task = transitionTask(task, "RUNNING", silentLogger());

    expect(task.startedAt).toBe(firstStartedAt);
  });

  it("sets completedAt when reaching a terminal status", () => {
    let task = base();
    task = transitionTask(task, "DISPATCHING", silentLogger());
    task = transitionTask(task, "RUNNING", silentLogger());
    expect(task.completedAt).toBeNull();

    task = transitionTask(task, "COMPLETED", silentLogger());
    expect(task.completedAt).not.toBeNull();
  });

  it("leaves completedAt null when transitioning to WAITING (not terminal)", () => {
    let task = base();
    task = transitionTask(task, "DISPATCHING", silentLogger());
    task = transitionTask(task, "RUNNING", silentLogger());
    task = transitionTask(task, "WAITING", silentLogger());

    expect(task.completedAt).toBeNull();
  });

  it("does not mutate the original task object", () => {
    const original = base();
    const copy = { ...original };

    transitionTask(original, "DISPATCHING", silentLogger());

    expect(original).toEqual(copy);
  });

  it("on an invalid transition, returns a task equal to the original", () => {
    const original = base();
    const next = transitionTask(original, "COMPLETED", silentLogger());
    expect(next).toEqual(original);
  });
});
