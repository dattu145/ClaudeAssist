import { describe, expect, it } from "vitest";
import {
  CreateProjectRequestSchema,
  HealthResponseSchema,
  SendInstructionRequestSchema,
  StartSessionRequestSchema,
} from "./api.js";

describe("CreateProjectRequestSchema", () => {
  it("accepts a valid request", () => {
    expect(
      CreateProjectRequestSchema.safeParse({ name: "Website", path: "/x/y" }).success
    ).toBe(true);
  });

  it("rejects a missing path", () => {
    expect(CreateProjectRequestSchema.safeParse({ name: "Website" }).success).toBe(false);
  });
});

describe("StartSessionRequestSchema", () => {
  it("accepts a request with only projectId", () => {
    expect(StartSessionRequestSchema.safeParse({ projectId: "project_1" }).success).toBe(true);
  });
});

describe("SendInstructionRequestSchema", () => {
  it("rejects an empty instruction", () => {
    expect(SendInstructionRequestSchema.safeParse({ instruction: "" }).success).toBe(false);
  });
});

describe("HealthResponseSchema", () => {
  it("accepts a valid health payload", () => {
    expect(
      HealthResponseSchema.safeParse({
        status: "ok",
        uptimeSeconds: 12,
        dbReachable: true,
        claudeCliReachable: true,
        lastReconciliationAt: null,
      }).success
    ).toBe(true);
  });
});
