import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "@claudeops/logging";
import type { DomainEvent } from "@claudeops/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";
import { FakeBordioClient } from "./adapters/bordio/fake-bordio-client.js";
import { BordioNotificationService } from "./adapters/bordio/bordio-notification-service.js";
import { SqliteBordioLinkRepository } from "./adapters/persistence/sqlite/bordio-link-repository.js";

/**
 * TEST_PLAN.md's "Recovery" layer, applied to pageB2's bordio_links
 * mapping table (pageB5): a link written by one controller instance
 * must be found and reused by a second instance sharing the same
 * on-disk database — the same "no code path finalizes state on
 * shutdown, only startup-time state must be correct" model page16/
 * page21's recovery.test.ts already established for sessions.
 */
function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

function sampleEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "event_1",
    type: "SESSION_WAITING_FOR_INPUT",
    timestamp: new Date().toISOString(),
    sessionId: "session_1",
    payload: {},
    source: "controller",
    ...overrides,
  };
}

describe("Bordio recovery: bordio_links survives a restart", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("a second instance reuses the link a first instance wrote, instead of creating a duplicate Bordio task", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-bordio-recovery-"));

    // --- Instance A: writes the link.
    const dbA = openDatabase(dataDir);
    runMigrations(dbA);
    const bordioClientA = new FakeBordioClient();
    const serviceA = new BordioNotificationService(
      bordioClientA,
      new SqliteBordioLinkRepository(dbA),
      silentLogger()
    );

    await serviceA.notify({
      title: "Session needs input",
      body: "Session session_1",
      event: sampleEvent({ type: "SESSION_WAITING_FOR_INPUT" }),
    });

    const createdResult = await bordioClientA.listTasks();
    expect(createdResult.tasks).toHaveLength(1);
    const createdTask = createdResult.tasks[0]!;

    dbA.close();

    // --- Instance B: a genuinely fresh process (fresh FakeBordioClient,
    // zero memory of instance A — the fake stands in for the real
    // Bordio task still existing remotely via seedTask), reopening the
    // same on-disk database file.
    const dbB = openDatabase(dataDir);
    runMigrations(dbB); // no-op, already applied — matches a real restart
    const bordioClientB = new FakeBordioClient();
    bordioClientB.seedTask(createdTask);
    const serviceB = new BordioNotificationService(
      bordioClientB,
      new SqliteBordioLinkRepository(dbB),
      silentLogger()
    );

    await serviceB.notify({
      title: "Session completed",
      body: "Session session_1",
      event: sampleEvent({ type: "SESSION_COMPLETED" }),
    });

    const finalResult = await bordioClientB.listTasks();
    expect(finalResult.tasks).toHaveLength(1); // still one task, not two
    expect(finalResult.tasks[0]?.id).toBe(createdTask.id);
    expect(finalResult.tasks[0]?.title).toBe("Session completed");
    expect(finalResult.tasks[0]?.statusId).toBe("status_done");

    dbB.close();
  });
});
