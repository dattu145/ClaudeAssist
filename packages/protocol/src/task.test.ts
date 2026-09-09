import { describe, expect, it } from "vitest";
import { TaskSchema } from "./task.js";

describe("TaskSchema", () => {
  const valid = {
    id: "task_1",
    projectId: "project_1",
    sessionId: "session_1",
    instruction: "fix the login bug",
    status: "QUEUED",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
  };

  it("accepts a valid task", () => {
    expect(TaskSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty instruction", () => {
    expect(TaskSchema.safeParse({ ...valid, instruction: "" }).success).toBe(false);
  });

  it("rejects an invalid status", () => {
    expect(TaskSchema.safeParse({ ...valid, status: "DONE" }).success).toBe(false);
  });
});
