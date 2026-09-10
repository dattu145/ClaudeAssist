import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { loadConfig } from "@claudeops/config";
import { createLogger } from "@claudeops/logging";
import { afterEach, describe, expect, it } from "vitest";
import { startController, type StartControllerOverrides } from "./lifecycle.js";
import { FakeClaudeSessionAdapter } from "./adapters/fake/fake-claude-session-adapter.js";
import { FakeBordioClient } from "./adapters/bordio/fake-bordio-client.js";
import type { ProcessDiscoveryService } from "./domain/process-discovery/service.js";

// Fast, deterministic overrides — the real ClaudeCodeAdapter/
// ProcessDiscoveryService each spawn real subprocesses, which
// reconciliation (page16) now calls on every startup. Real integration of
// those is already covered separately (claude-code-adapter.real.test.ts,
// page15's manual check); these tests exercise the controller's own
// orchestration logic (migrations, listening, shutdown, pairing, auth,
// reconciliation wiring), not Claude Code integration itself.
function fastOverrides(): StartControllerOverrides {
  return {
    claudeAdapter: new FakeClaudeSessionAdapter(createLogger({ component: "test" }, { write: () => {} })),
    processDiscovery: {
      listProcesses: () => Promise.resolve([]),
      findClaudeProcesses: () => Promise.resolve([]),
    } satisfies ProcessDiscoveryService,
    checkClaudeCli: () => Promise.resolve(true),
  };
}

describe("startController / stop", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("starts an HTTP server, applies migrations, and serves /health", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-lifecycle-"));
    const config = loadConfig({ PORT: "0", DATA_DIR: dataDir });
    const logger = createLogger({ component: "test" }, { write: () => {} });

    const controller = await startController(config, logger, fastOverrides());
    const port = (controller.server.address() as AddressInfo).port;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);

    const migrationRow = controller.db
      .prepare("SELECT filename FROM migrations WHERE filename = ?")
      .get("0001_init.sql");
    expect(migrationRow).toBeDefined();

    await controller.stop();
  });

  it("stops accepting connections and closes the db after stop()", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-lifecycle-"));
    const config = loadConfig({ PORT: "0", DATA_DIR: dataDir });
    const logger = createLogger({ component: "test" }, { write: () => {} });

    const controller = await startController(config, logger, fastOverrides());
    const port = (controller.server.address() as AddressInfo).port;

    await controller.stop();

    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
    expect(() => controller.db.prepare("SELECT 1").get()).toThrow();
  });

  it("issues a fresh pairing code on startup and logs it", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-lifecycle-"));
    const config = loadConfig({ PORT: "0", DATA_DIR: dataDir });
    const lines: string[] = [];
    const logger = createLogger({ component: "test" }, { write: (l) => lines.push(l) });

    const controller = await startController(config, logger, fastOverrides());

    const pairingRow = controller.db.prepare("SELECT * FROM pairing_codes").get() as
      | { code: string; consumed_at: string | null }
      | undefined;
    expect(pairingRow).toBeDefined();
    expect(pairingRow?.consumed_at).toBeNull();
    expect(lines.some((l) => l.includes("pairing code ready") && l.includes(pairingRow!.code))).toBe(
      true
    );

    await controller.stop();
  });

  it("rejects an unauthenticated request to a protected route, but /health stays public", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-lifecycle-"));
    const config = loadConfig({ PORT: "0", DATA_DIR: dataDir });
    const logger = createLogger({ component: "test" }, { write: () => {} });

    const controller = await startController(config, logger, fastOverrides());
    const port = (controller.server.address() as AddressInfo).port;

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);

    const projects = await fetch(`http://127.0.0.1:${port}/projects`);
    expect(projects.status).toBe(401);

    await controller.stop();
  });

  it("runs reconciliation before listening and exposes lastReconciliationAt via /health", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-lifecycle-"));
    const config = loadConfig({ PORT: "0", DATA_DIR: dataDir });
    const logger = createLogger({ component: "test" }, { write: () => {} });

    const controller = await startController(config, logger, fastOverrides());
    const port = (controller.server.address() as AddressInfo).port;

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = (await res.json()) as { lastReconciliationAt: string | null };
    expect(body.lastReconciliationAt).not.toBeNull();
    expect(new Date(body.lastReconciliationAt as string).getTime()).toBeLessThanOrEqual(Date.now());

    await controller.stop();
  });

  it("stop() is idempotent", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-lifecycle-"));
    const config = loadConfig({ PORT: "0", DATA_DIR: dataDir });
    const logger = createLogger({ component: "test" }, { write: () => {} });

    const controller = await startController(config, logger, fastOverrides());
    await controller.stop();
    await expect(controller.stop()).resolves.toBeUndefined();
  });
});

describe("startController / Bordio integration (pageB3)", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  function extractPairingCode(lines: string[]): string {
    for (const line of lines) {
      const parsed = JSON.parse(line) as { code?: string };
      if (parsed.code) {
        return parsed.code;
      }
    }
    throw new Error("no pairing code found in captured log lines");
  }

  it("is fully disabled (no Bordio task ever created) when BORDIO_API_KEY is unset", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-bordio-lifecycle-"));
    const config = loadConfig({ PORT: "0", DATA_DIR: dataDir });
    const lines: string[] = [];
    const logger = createLogger({ component: "test" }, { write: (l) => lines.push(l) });
    const bordioClient = new FakeBordioClient();

    const controller = await startController(config, logger, { ...fastOverrides(), bordioClient });
    const port = (controller.server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const token = await (
      await fetch(`${baseUrl}/pairing/exchange`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: extractPairingCode(lines) }),
      })
    ).json().then((b: unknown) => (b as { token: string }).token);
    const authHeaders = { "content-type": "application/json", authorization: `Bearer ${token}` };

    const project = await (
      await fetch(`${baseUrl}/projects`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "No Bordio", path: dataDir }),
      })
    ).json();

    await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ projectId: (project as { id: string }).id, initialInstruction: "say hello" }),
    });

    const result = await bordioClient.listTasks();
    expect(result.tasks).toHaveLength(0);

    await controller.stop();
  });

  it("creates a Bordio task for a session reaching COMPLETED when BORDIO_API_KEY is set (fake client)", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-bordio-lifecycle-"));
    const config = loadConfig({ PORT: "0", DATA_DIR: dataDir, BORDIO_API_KEY: "brd_sk_live_test" });
    const lines: string[] = [];
    const logger = createLogger({ component: "test" }, { write: (l) => lines.push(l) });
    const bordioClient = new FakeBordioClient();

    const controller = await startController(config, logger, { ...fastOverrides(), bordioClient });
    const port = (controller.server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const token = await (
      await fetch(`${baseUrl}/pairing/exchange`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: extractPairingCode(lines) }),
      })
    ).json().then((b: unknown) => (b as { token: string }).token);
    const authHeaders = { "content-type": "application/json", authorization: `Bearer ${token}` };

    const project = await (
      await fetch(`${baseUrl}/projects`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "With Bordio", path: dataDir }),
      })
    ).json();

    await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ projectId: (project as { id: string }).id, initialInstruction: "say hello" }),
    });

    const result = await bordioClient.listTasks();
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.title).toBe("Session completed");
    expect(result.tasks[0]?.statusId).toBe("status_done");

    const linkRow = controller.db.prepare("SELECT * FROM bordio_links").get() as
      | { bordio_task_id: string }
      | undefined;
    expect(linkRow?.bordio_task_id).toBe(result.tasks[0]?.id);

    await controller.stop();
  });
});

describe("startController / Bordio inbound polling (pageB4)", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  function extractPairingCode(lines: string[]): string {
    for (const line of lines) {
      const parsed = JSON.parse(line) as { code?: string };
      if (parsed.code) {
        return parsed.code;
      }
    }
    throw new Error("no pairing code found in captured log lines");
  }

  it("dispatches an instruction for a linked, command-tagged Bordio task and untags it", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-bordio-poll-lifecycle-"));
    const config = loadConfig({
      PORT: "0",
      DATA_DIR: dataDir,
      BORDIO_API_KEY: "brd_sk_live_test",
      BORDIO_COMMAND_TAG_ID: "tag_command",
    });
    const lines: string[] = [];
    const logger = createLogger({ component: "test" }, { write: (l) => lines.push(l) });
    const bordioClient = new FakeBordioClient();
    const adapter = new FakeClaudeSessionAdapter(createLogger({ component: "test" }, { write: () => {} }));

    const controller = await startController(config, logger, { ...fastOverrides(), claudeAdapter: adapter, bordioClient });
    const port = (controller.server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const token = await (
      await fetch(`${baseUrl}/pairing/exchange`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: extractPairingCode(lines) }),
      })
    ).json().then((b: unknown) => (b as { token: string }).token);
    const authHeaders = { "content-type": "application/json", authorization: `Bearer ${token}` };

    const project = await (
      await fetch(`${baseUrl}/projects`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ name: "Inbound Poll Check", path: dataDir }),
      })
    ).json();
    const session = await (
      await fetch(`${baseUrl}/sessions`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ projectId: (project as { id: string }).id }),
      })
    ).json();
    const sessionId = (session as { id: string }).id;

    // Drive the session to WAITING_FOR_INPUT so the outbound sync
    // (pageB3, already wired) creates and links a real Bordio task for
    // it — the same card the user would see and reply to.
    adapter.queueInstructionOutcome(sessionId, "waiting_for_input");
    await fetch(`${baseUrl}/sessions/${sessionId}/instructions`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ instruction: "ask a question" }),
    });

    const linked = await bordioClient.listTasks();
    expect(linked.tasks).toHaveLength(1);
    const bordioTaskId = linked.tasks[0]?.id as string;

    // Simulate the user replying: edit the title and apply the command
    // tag to the same linked card.
    await bordioClient.updateTask(bordioTaskId, { title: "please continue", tagIds: ["tag_command"] });

    expect(controller.pollBordioInboundCommandsNow).toBeDefined();
    await controller.pollBordioInboundCommandsNow?.();

    const tasksRes = await fetch(`${baseUrl}/sessions/${sessionId}/tasks`, { headers: authHeaders });
    const tasks = (await tasksRes.json()) as Array<{ instruction: string }>;
    expect(tasks.some((t) => t.instruction === "please continue")).toBe(true);

    const afterPoll = await bordioClient.listTasks();
    expect(afterPoll.tasks[0]?.tagIds).not.toContain("tag_command");

    await controller.stop();
  });

  it("pollBordioInboundCommandsNow is undefined when BORDIO_COMMAND_TAG_ID is unset", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-bordio-poll-lifecycle-"));
    const config = loadConfig({ PORT: "0", DATA_DIR: dataDir, BORDIO_API_KEY: "brd_sk_live_test" });
    const logger = createLogger({ component: "test" }, { write: () => {} });

    const controller = await startController(config, logger, { ...fastOverrides(), bordioClient: new FakeBordioClient() });

    expect(controller.pollBordioInboundCommandsNow).toBeUndefined();

    await controller.stop();
  });
});
