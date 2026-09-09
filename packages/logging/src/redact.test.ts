import { describe, expect, it } from "vitest";
import { redact } from "./redact.js";

describe("redact", () => {
  it("redacts keys matching the sensitive pattern", () => {
    expect(redact({ apiToken: "abc123" })).toEqual({ apiToken: "[REDACTED]" });
    expect(redact({ password: "hunter2" })).toEqual({ password: "[REDACTED]" });
    expect(redact({ credentialSet: "x" })).toEqual({ credentialSet: "[REDACTED]" });
  });

  it("leaves unrelated keys untouched", () => {
    expect(redact({ sessionId: "abc", message: "hello" })).toEqual({
      sessionId: "abc",
      message: "hello",
    });
  });

  it("redacts nested objects", () => {
    expect(redact({ auth: { secretKey: "xyz", userId: "u1" } })).toEqual({
      auth: { secretKey: "[REDACTED]", userId: "u1" },
    });
  });

  it("redacts within arrays", () => {
    expect(redact([{ token: "t1" }, { name: "ok" }])).toEqual([
      { token: "[REDACTED]" },
      { name: "ok" },
    ]);
  });

  it("passes through primitives unchanged", () => {
    expect(redact("hello")).toBe("hello");
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
  });
});
