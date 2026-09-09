import { HealthResponseSchema } from "@claudeops/protocol";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp } from "./test-support/build-test-app.js";

describe("createApp", () => {
  let db: ReturnType<typeof buildTestApp>["db"] | undefined;

  afterEach(() => {
    db?.close();
  });

  function build(checkClaudeCli: () => Promise<boolean> = () => Promise.resolve(true)) {
    const ctx = buildTestApp(checkClaudeCli);
    db = ctx.db;
    return ctx.app;
  }

  it("GET /health returns a HealthResponseSchema-valid body", async () => {
    const app = build();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(HealthResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.status).toBe("ok");
  });

  it("returns 404 for an unknown route", async () => {
    const app = build();
    const res = await request(app).get("/nope");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });
});
