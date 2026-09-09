import { describe, expect, it } from "vitest";
import { SHARED_PACKAGE_VERSION } from "@claudeops/shared";

describe("workspace wiring smoke test", () => {
  it("can import from @claudeops/shared", () => {
    expect(SHARED_PACKAGE_VERSION).toBe("0.1.0");
  });
});
