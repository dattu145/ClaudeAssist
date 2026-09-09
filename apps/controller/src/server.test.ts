import { HealthResponseSchema } from "@claudeops/protocol";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { buildTestApp, type TestAppContext } from "./test-support/build-test-app.js";

describe("createApp", () => {
  let ctx: TestAppContext | undefined;

  afterEach(() => {
    ctx?.db.close();
  });

  async function build(checkClaudeCli: () => Promise<boolean> = () => Promise.resolve(true)) {
    ctx = await buildTestApp(checkClaudeCli);
    return ctx;
  }

  it("GET /health returns a HealthResponseSchema-valid body, unauthenticated", async () => {
    const { app } = await build();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(HealthResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.status).toBe("ok");
  });

  it("returns 401 for an unauthenticated request to an unknown route", async () => {
    const { app } = await build();
    const res = await request(app).get("/nope");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("UNAUTHORIZED");
  });

  it("returns 404 for an unknown route once authenticated", async () => {
    const { app, authToken } = await build();
    const res = await request(app).get("/nope").set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });
});
