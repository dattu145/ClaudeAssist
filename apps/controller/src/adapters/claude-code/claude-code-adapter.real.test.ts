import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "@claudeops/logging";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeCodeAdapter } from "./claude-code-adapter.js";

/**
 * Opt-in only (see .claude/TEST_PLAN.md "Adapter (real, opt-in)" layer):
 * exercises the real `claude` CLI, spends real API usage, and is excluded
 * from the default `npm test` run. Enable explicitly:
 *   CLAUDEOPS_REAL_CLI_TESTS=1 npx vitest run claude-code-adapter.real.test.ts
 * Exists to catch drift in the real CLI's stream-json/agents --json shapes
 * over time (see research/claude-code.md).
 */
const REAL = process.env.CLAUDEOPS_REAL_CLI_TESTS === "1";

describe.skipIf(!REAL)("ClaudeCodeAdapter (real CLI)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "claudeops-real-adapter-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("dispatches a real instruction and gets a completed result", async () => {
    const logger = createLogger({ component: "test" }, { write: () => {} });
    const adapter = new ClaudeCodeAdapter(logger, undefined, {
      permissionMode: "dontAsk",
      restricted: true,
    });

    const session = await adapter.startSession({
      projectId: "p1",
      projectPath: dir,
      initialInstruction: "Reply with exactly the word OK and nothing else.",
    });

    expect(session.status).toBe("COMPLETED");
    expect(session.claudeSessionId).toBeTruthy();
  }, 60_000);

  it("discovers real running claude processes", async () => {
    const logger = createLogger({ component: "test" }, { write: () => {} });
    const adapter = new ClaudeCodeAdapter(logger);

    const discovered = await adapter.discoverSessions();

    expect(Array.isArray(discovered)).toBe(true);
  }, 30_000);
});
