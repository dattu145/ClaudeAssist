import { describe, expect, it } from "vitest";
import { TASK_STATUSES, TASK_STATUS_TRANSITIONS, TaskSchema, isValidTaskTransition } from "./task.js";

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

describe("TaskStatus transitions", () => {
  it("only allows transitions explicitly listed for each state", () => {
    for (const from of TASK_STATUSES) {
      for (const to of TASK_STATUSES) {
        expect(isValidTaskTransition(from, to)).toBe(TASK_STATUS_TRANSITIONS[from].includes(to));
      }
    }
  });

  it("terminal states allow no outgoing transitions", () => {
    for (const terminal of ["COMPLETED", "FAILED", "CANCELLED"] as const) {
      for (const to of TASK_STATUSES) {
        expect(isValidTaskTransition(terminal, to)).toBe(false);
      }
    }
  });

  it("rejects RUNNING -> CANCELLED (deliberately unsupported, see page11)", () => {
    expect(isValidTaskTransition("RUNNING", "CANCELLED")).toBe(false);
  });

  it("allows WAITING -> CANCELLED", () => {
    expect(isValidTaskTransition("WAITING", "CANCELLED")).toBe(true);
  });
});
