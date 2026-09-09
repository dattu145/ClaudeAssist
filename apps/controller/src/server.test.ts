import Database from "better-sqlite3";
import { createLogger } from "@claudeops/logging";
import { HealthResponseSchema } from "@claudeops/protocol";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./server.js";

describe("createApp", () => {
  let db: Database.Database;

  afterEach(() => {
    db?.close();
  });

  function buildApp(checkClaudeCli: () => Promise<boolean> = () => Promise.resolve(true)) {
    db = new Database(":memory:");
    const logger = createLogger({ component: "test" }, { write: () => {} });
    return createApp({ db, startedAt: Date.now(), logger, checkClaudeCli });
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
