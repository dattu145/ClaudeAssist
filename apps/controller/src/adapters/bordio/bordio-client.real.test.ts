import { randomUUID } from "node:crypto";
import { createLogger } from "@claudeops/logging";
import { describe, expect, it } from "vitest";
import { BordioApiClient } from "./bordio-client.js";

/**
 * Opt-in only (see .claude/TEST_PLAN.md "Adapter (real, opt-in)" layer,
 * mirroring claude-code-adapter.real.test.ts): exercises the real Bordio
 * API and is excluded from the default `npm test` run. Enable explicitly:
 *   CLAUDEOPS_REAL_BORDIO_TESTS=1 BORDIO_API_KEY=brd_sk_live_... \
 *     npx vitest run bordio-client.real.test.ts
 * No real BORDIO_API_KEY/workspace is available in this environment
 * (see .claude/plans/pageB1.md Risks) — this suite is written but has not
 * been run here.
 */
const REAL = process.env.CLAUDEOPS_REAL_BORDIO_TESTS === "1" && Boolean(process.env.BORDIO_API_KEY);

describe.skipIf(!REAL)("BordioApiClient (real API)", () => {
  it("lists task status definitions", async () => {
    const logger = createLogger({ component: "test" }, { write: () => {} });
    const client = new BordioApiClient(process.env.BORDIO_API_KEY as string, logger);

    const definitions = await client.listTaskStatusDefinitions();

    expect(definitions.length).toBeGreaterThan(0);
    expect(definitions.some((d) => d.state === "open" || d.state === "closed")).toBe(true);
  }, 30_000);

  it("creates a task idempotently and lists it back", async () => {
    const logger = createLogger({ component: "test" }, { write: () => {} });
    const client = new BordioApiClient(process.env.BORDIO_API_KEY as string, logger);
    const idempotencyKey = randomUUID();

    const task = await client.createTask({ title: `ClaudeOps real-test ${idempotencyKey}` }, idempotencyKey);
    const replay = await client.createTask({ title: `ClaudeOps real-test ${idempotencyKey}` }, idempotencyKey);

    expect(replay.id).toBe(task.id);

    const result = await client.listTasks();
    expect(result.tasks.some((t) => t.id === task.id)).toBe(true);
  }, 30_000);
});
