import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { loadConfig } from "@claudeops/config";
import { createLogger } from "@claudeops/logging";
import { afterEach, describe, expect, it } from "vitest";
import { startController, type StartControllerOverrides } from "./lifecycle.js";
import { FakeClaudeSessionAdapter } from "./adapters/fake/fake-claude-session-adapter.js";
import type { ProcessDiscoveryService } from "./domain/process-discovery/service.js";

/**
 * TEST_PLAN.md's "Recovery" layer: kill the controller mid-task, restart,
 * assert reconciliation produces correct states — exercised here against
 * the *full* startController() stack across two real instances sharing
 * one on-disk database, not just Reconciler in isolation
 * (domain/reconciliation/reconciler.test.ts already covers that unit
 * level). A fresh FakeClaudeSessionAdapter for the second instance
 * matches page16's design: a real restart always starts with zero
 * in-memory adapter state, regardless of what's actually still running.
 */
function noopOverrides(): StartControllerOverrides {
  return {
    claudeAdapter: new FakeClaudeSessionAdapter(createLogger({ component: "test" }, { write: () => {} })),
    processDiscovery: {
      listProcesses: () => Promise.resolve([]),
      findClaudeProcesses: () => Promise.resolve([]),
    } satisfies ProcessDiscoveryService,
    checkClaudeCli: () => Promise.resolve(true),
  };
}

function capturingLogger(): { logger: ReturnType<typeof createLogger>; lines: string[] } {
  const lines: string[] = [];
  const logger = createLogger({ component: "test" }, { write: (l) => lines.push(l) });
  return { logger, lines };
}

function extractPairingCode(lines: string[]): string {
  for (const line of lines) {
    const parsed = JSON.parse(line) as { code?: string };
    if (parsed.code) {
      return parsed.code;
    }
  }
  throw new Error("no pairing code found in captured log lines");
}

async function pair(baseUrl: string, code: string): Promise<string> {
  const res = await fetch(`${baseUrl}/pairing/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const { token } = (await res.json()) as { token: string };
  return token;
}

describe("recovery: a real restart against the same on-disk database", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("reconciles a session frozen mid-dispatch (simulated crash) to DISCONNECTED after a fresh startController()", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-recovery-"));
    const config = loadConfig({ PORT: "0", DATA_DIR: dataDir });

    // --- Instance A: create a project + session, then simulate a hard
    // kill by leaving the session's persisted row in a mid-flight status
    // (WORKING) and stopping without any graceful finalization — matching
    // what a real crash actually leaves on disk (nothing in this
    // codebase's design finalizes session state on shutdown; only
    // startup-time reconciliation, page16, catches it).
    const a = capturingLogger();
    const controllerA = await startController(config, a.logger, noopOverrides());
    const portA = (controllerA.server.address() as AddressInfo).port;
    const baseUrlA = `http://127.0.0.1:${portA}`;
    const tokenA = await pair(baseUrlA, extractPairingCode(a.lines));
    const authHeadersA = { "content-type": "application/json", authorization: `Bearer ${tokenA}` };

    const projectRes = await fetch(`${baseUrlA}/projects`, {
      method: "POST",
      headers: authHeadersA,
      body: JSON.stringify({ name: "Recovery Check", path: dataDir }),
    });
    const project = (await projectRes.json()) as { id: string };

    const sessionRes = await fetch(`${baseUrlA}/sessions`, {
      method: "POST",
      headers: authHeadersA,
      body: JSON.stringify({ projectId: project.id }),
    });
    const session = (await sessionRes.json()) as { id: string; status: string };
    expect(session.status).toBe("IDLE");

    controllerA.db.prepare("UPDATE sessions SET status = 'WORKING' WHERE id = ?").run(session.id);

    await controllerA.stop();

    // --- Instance B: a genuinely fresh process (fresh FakeClaudeSessionAdapter,
    // zero memory of session.id) started against the same DATA_DIR/data.db.
    const b = capturingLogger();
    const controllerB = await startController(config, b.logger, noopOverrides());
    const portB = (controllerB.server.address() as AddressInfo).port;
    const baseUrlB = `http://127.0.0.1:${portB}`;
    const tokenB = await pair(baseUrlB, extractPairingCode(b.lines));
    const authHeadersB = { authorization: `Bearer ${tokenB}` };

    const recoveredRes = await fetch(`${baseUrlB}/sessions/${session.id}`, { headers: authHeadersB });
    expect(recoveredRes.status).toBe(200);
    const recovered = (await recoveredRes.json()) as { status: string };
    expect(recovered.status).toBe("DISCONNECTED");

    await controllerB.stop();
  });

  it("does not disturb a session that was already IDLE (not mid-flight) at the time of the restart", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-recovery-"));
    const config = loadConfig({ PORT: "0", DATA_DIR: dataDir });

    const a = capturingLogger();
    const controllerA = await startController(config, a.logger, noopOverrides());
    const portA = (controllerA.server.address() as AddressInfo).port;
    const baseUrlA = `http://127.0.0.1:${portA}`;
    const tokenA = await pair(baseUrlA, extractPairingCode(a.lines));
    const authHeadersA = { "content-type": "application/json", authorization: `Bearer ${tokenA}` };

    const projectRes = await fetch(`${baseUrlA}/projects`, {
      method: "POST",
      headers: authHeadersA,
      body: JSON.stringify({ name: "Recovery Check 2", path: dataDir }),
    });
    const project = (await projectRes.json()) as { id: string };

    const sessionRes = await fetch(`${baseUrlA}/sessions`, {
      method: "POST",
      headers: authHeadersA,
      body: JSON.stringify({ projectId: project.id }),
    });
    const session = (await sessionRes.json()) as { id: string; status: string };
    expect(session.status).toBe("IDLE");

    await controllerA.stop();

    const b = capturingLogger();
    const controllerB = await startController(config, b.logger, noopOverrides());
    const portB = (controllerB.server.address() as AddressInfo).port;
    const baseUrlB = `http://127.0.0.1:${portB}`;
    const tokenB = await pair(baseUrlB, extractPairingCode(b.lines));
    const authHeadersB = { authorization: `Bearer ${tokenB}` };

    const res = await fetch(`${baseUrlB}/sessions/${session.id}`, { headers: authHeadersB });
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("IDLE");

    await controllerB.stop();
  });
});
