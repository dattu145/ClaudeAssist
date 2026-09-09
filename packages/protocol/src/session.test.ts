import { describe, expect, it } from "vitest";
import {
  ClaudeSessionSchema,
  SESSION_STATUSES,
  SESSION_STATUS_TRANSITIONS,
  isValidSessionTransition,
} from "./session.js";

describe("SessionStatus transitions", () => {
  it("only allows transitions explicitly listed for each state", () => {
    for (const from of SESSION_STATUSES) {
      for (const to of SESSION_STATUSES) {
        const allowed = SESSION_STATUS_TRANSITIONS[from].includes(to);
        expect(isValidSessionTransition(from, to)).toBe(allowed);
      }
    }
  });

  it("rejects WORKING -> DISCOVERED (not a listed transition)", () => {
    expect(isValidSessionTransition("WORKING", "DISCOVERED")).toBe(false);
  });

  it("allows WORKING -> COMPLETED", () => {
    expect(isValidSessionTransition("WORKING", "COMPLETED")).toBe(true);
  });

  it("allows UNKNOWN -> any state (recovery case)", () => {
    for (const to of SESSION_STATUSES) {
      expect(isValidSessionTransition("UNKNOWN", to)).toBe(true);
    }
  });
});

describe("ClaudeSessionSchema", () => {
  const valid = {
    id: "session_1",
    projectId: "project_1",
    claudeSessionId: "claude-uuid",
    status: "WORKING",
    currentTask: "fix the bug",
    processId: 1234,
    terminalId: null,
    lastOutput: "...",
    lastError: null,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };

  it("accepts a valid session", () => {
    expect(ClaudeSessionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid status", () => {
    const result = ClaudeSessionSchema.safeParse({ ...valid, status: "BOGUS" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing id", () => {
    const { id: _id, ...rest } = valid;
    expect(ClaudeSessionSchema.safeParse(rest).success).toBe(false);
  });
});
