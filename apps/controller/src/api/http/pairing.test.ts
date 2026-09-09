import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { PairingTokenResponseSchema } from "@claudeops/protocol";
import { buildTestApp, type TestAppContext } from "../../test-support/build-test-app.js";

describe("/pairing", () => {
  let ctx: TestAppContext;
  let app: Express;

  beforeEach(async () => {
    ctx = await buildTestApp();
    app = ctx.app;
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("POST /exchange issues a token for a freshly issued code", async () => {
    const code = await ctx.pairingRegistry.issueStartupCode();

    const res = await request(app).post("/pairing/exchange").send({ code });

    expect(res.status).toBe(201);
    expect(PairingTokenResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it("the exchanged token authenticates a protected route", async () => {
    const code = await ctx.pairingRegistry.issueStartupCode();
    const { body } = await request(app).post("/pairing/exchange").send({ code });

    const res = await request(app)
      .get("/projects")
      .set("Authorization", `Bearer ${body.token as string}`);

    expect(res.status).toBe(200);
  });

  it("POST /exchange rejects an invalid code with 400", async () => {
    const res = await request(app).post("/pairing/exchange").send({ code: "BOGUS0000" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_PAIRING_CODE");
  });

  it("POST /exchange rejects a reused code with 400", async () => {
    const code = await ctx.pairingRegistry.issueStartupCode();
    await request(app).post("/pairing/exchange").send({ code });

    const res = await request(app).post("/pairing/exchange").send({ code });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_PAIRING_CODE");
  });

  it("POST /exchange rejects an empty body with 400", async () => {
    const res = await request(app).post("/pairing/exchange").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("POST /revoke requires authentication", async () => {
    const res = await request(app).post("/pairing/revoke");
    expect(res.status).toBe(401);
  });

  it("POST /revoke revokes the token used to authenticate, which then stops working", async () => {
    const revokeRes = await request(app)
      .post("/pairing/revoke")
      .set("Authorization", `Bearer ${ctx.authToken}`);
    expect(revokeRes.status).toBe(204);

    const followUp = await request(app)
      .get("/projects")
      .set("Authorization", `Bearer ${ctx.authToken}`);
    expect(followUp.status).toBe(401);
  });
});
