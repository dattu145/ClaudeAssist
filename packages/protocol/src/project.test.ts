import { describe, expect, it } from "vitest";
import { ProjectSchema } from "./project.js";

describe("ProjectSchema", () => {
  const valid = {
    id: "project_123",
    name: "Website",
    path: "/Users/user/projects/website",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("accepts a valid project", () => {
    expect(ProjectSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(ProjectSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects an invalid status", () => {
    expect(ProjectSchema.safeParse({ ...valid, status: "deleted" }).success).toBe(false);
  });
});
