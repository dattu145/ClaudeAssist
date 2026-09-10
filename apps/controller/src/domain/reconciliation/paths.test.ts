import { describe, expect, it } from "vitest";
import { isSamePath } from "./paths.js";

describe("isSamePath", () => {
  it("matches identical paths", () => {
    expect(isSamePath("/x/y", "/x/y")).toBe(true);
  });

  it("normalizes backslashes vs forward slashes", () => {
    expect(isSamePath("C:\\x\\y", "C:/x/y")).toBe(true);
  });

  it("ignores case", () => {
    expect(isSamePath("C:/Users/Site", "c:/users/site")).toBe(true);
  });

  it("ignores a trailing slash", () => {
    expect(isSamePath("/x/y/", "/x/y")).toBe(true);
  });

  it("does not match genuinely different paths", () => {
    expect(isSamePath("/x/y", "/x/z")).toBe(false);
  });
});
