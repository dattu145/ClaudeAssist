import { describe, expect, it } from "vitest";
import { generateId } from "./id.js";

describe("generateId", () => {
  it("prefixes the id with the given prefix", () => {
    expect(generateId("session")).toMatch(/^session_[0-9a-f-]{36}$/);
  });

  it("generates unique ids", () => {
    const a = generateId("project");
    const b = generateId("project");
    expect(a).not.toBe(b);
  });
});
