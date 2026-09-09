import { describe, expect, it } from "vitest";
import { SHARED_PACKAGE_VERSION } from "@claudeops/shared";
import { loadConfig } from "@claudeops/config";
import { ProjectSchema } from "@claudeops/protocol";
import { createLogger } from "@claudeops/logging";

describe("workspace wiring smoke test", () => {
  it("can import from @claudeops/shared", () => {
    expect(SHARED_PACKAGE_VERSION).toBe("0.1.0");
  });

  it("can import and use @claudeops/config", () => {
    expect(loadConfig({}).PORT).toBe(4000);
  });

  it("can import and use @claudeops/protocol", () => {
    expect(
      ProjectSchema.safeParse({
        id: "project_1",
        name: "Website",
        path: "/x",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).success
    ).toBe(true);
  });

  it("can import and use @claudeops/logging", () => {
    const lines: string[] = [];
    const logger = createLogger({ component: "test" }, { write: (l) => lines.push(l) });
    logger.info("wired");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string).message).toBe("wired");
  });
});
