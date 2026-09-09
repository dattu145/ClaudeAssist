import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { getHealth } from "./health.js";

describe("getHealth", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  it("reports ok when db and claude cli are both reachable", async () => {
    db = new Database(":memory:");
    const health = await getHealth({
      db,
      startedAt: Date.now() - 5000,
      checkClaudeCli: () => Promise.resolve(true),
    });

    expect(health.status).toBe("ok");
    expect(health.dbReachable).toBe(true);
    expect(health.claudeCliReachable).toBe(true);
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(5);
    expect(health.lastReconciliationAt).toBeNull();
  });

  it("reports degraded when db is reachable but claude cli is not", async () => {
    db = new Database(":memory:");
    const health = await getHealth({
      db,
      startedAt: Date.now(),
      checkClaudeCli: () => Promise.resolve(false),
    });

    expect(health.status).toBe("degraded");
  });

  it("reports down when the db is unreachable", async () => {
    db = new Database(":memory:");
    db.close();

    const health = await getHealth({
      db,
      startedAt: Date.now(),
      checkClaudeCli: () => Promise.resolve(true),
    });

    expect(health.status).toBe("down");
    expect(health.dbReachable).toBe(false);
  });

  it("passes through lastReconciliationAt when provided", async () => {
    db = new Database(":memory:");
    const iso = new Date().toISOString();
    const health = await getHealth({
      db,
      startedAt: Date.now(),
      checkClaudeCli: () => Promise.resolve(true),
      lastReconciliationAt: iso,
    });

    expect(health.lastReconciliationAt).toBe(iso);
  });
});
