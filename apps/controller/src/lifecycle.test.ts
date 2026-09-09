import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { loadConfig } from "@claudeops/config";
import { createLogger } from "@claudeops/logging";
import { afterEach, describe, expect, it } from "vitest";
import { startController } from "./lifecycle.js";

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

    const controller = await startController(config, logger);
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

    const controller = await startController(config, logger);
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

    const controller = await startController(config, logger);

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

    const controller = await startController(config, logger);
    const port = (controller.server.address() as AddressInfo).port;

    const health = await fetch(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);

    const projects = await fetch(`http://127.0.0.1:${port}/projects`);
    expect(projects.status).toBe(401);

    await controller.stop();
  });

  it("stop() is idempotent", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "claudeops-lifecycle-"));
    const config = loadConfig({ PORT: "0", DATA_DIR: dataDir });
    const logger = createLogger({ component: "test" }, { write: () => {} });

    const controller = await startController(config, logger);
    await controller.stop();
    await expect(controller.stop()).resolves.toBeUndefined();
  });
});
