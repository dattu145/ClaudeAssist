import { describe, expect, it } from "vitest";
import { nowIso } from "./time.js";

describe("nowIso", () => {
  it("returns a valid ISO-8601 UTC timestamp", () => {
    const ts = nowIso();
    expect(new Date(ts).toISOString()).toBe(ts);
  });
});
