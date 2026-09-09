import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

function captureLines() {
  const lines: unknown[] = [];
  const write = (line: string) => lines.push(JSON.parse(line));
  return { lines, write };
}

describe("createLogger", () => {
  it("writes a single valid JSON line per call with required fields", () => {
    const { lines, write } = captureLines();
    const logger = createLogger({ component: "test" }, { write });

    logger.info("hello");

    expect(lines).toHaveLength(1);
    const entry = lines[0] as Record<string, unknown>;
    expect(entry.component).toBe("test");
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("hello");
    expect(typeof entry.timestamp).toBe("string");
    expect(new Date(entry.timestamp as string).toISOString()).toBe(entry.timestamp);
  });

  it("merges base context and call-site context", () => {
    const { lines, write } = captureLines();
    const logger = createLogger({ component: "test", sessionId: "s1" }, { write });

    logger.info("hello", { taskId: "t1" });

    const entry = lines[0] as Record<string, unknown>;
    expect(entry.sessionId).toBe("s1");
    expect(entry.taskId).toBe("t1");
  });

  it("filters out messages below the configured minimum level", () => {
    const { lines, write } = captureLines();
    const logger = createLogger({ component: "test" }, { write, minLevel: "warn" });

    logger.debug("dropped");
    logger.info("dropped");
    logger.warn("kept");
    logger.error("kept");

    expect(lines).toHaveLength(2);
  });

  it("child() pre-merges context into a scoped logger", () => {
    const { lines, write } = captureLines();
    const logger = createLogger({ component: "test" }, { write });
    const child = logger.child({ sessionId: "s1" });

    child.info("scoped");

    const entry = lines[0] as Record<string, unknown>;
    expect(entry.sessionId).toBe("s1");
    expect(entry.component).toBe("test");
  });

  it("redacts sensitive fields before writing", () => {
    const { lines, write } = captureLines();
    const logger = createLogger({ component: "test" }, { write });

    logger.info("auth attempt", { apiToken: "shhh" });

    const entry = lines[0] as Record<string, unknown>;
    expect(entry.apiToken).toBe("[REDACTED]");
  });
});
