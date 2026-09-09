import Database from "better-sqlite3";
import { createLogger } from "@claudeops/logging";
import { HealthResponseSchema } from "@claudeops/protocol";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./server.js";
import { runMigrations } from "./db/migrate.js";
import { SqliteProjectRepository } from "./adapters/persistence/sqlite/project-repository.js";
import { ProjectRegistry } from "./domain/project/registry.js";

describe("createApp", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  function buildApp(checkClaudeCli: () => Promise<boolean> = () => Promise.resolve(true)) {
    db = new Database(":memory:");
    runMigrations(db);
    const logger = createLogger({ component: "test" }, { write: () => {} });
    const projectRegistry = new ProjectRegistry(new SqliteProjectRepository(db));
    return createApp({ db, startedAt: Date.now(), logger, checkClaudeCli, projectRegistry });
  }

  it("GET /health returns a HealthResponseSchema-valid body", async () => {
    const app = buildApp();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(HealthResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.status).toBe("ok");
  });

  it("returns 404 for an unknown route", async () => {
    const app = buildApp();
    const res = await request(app).get("/nope");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });
});
