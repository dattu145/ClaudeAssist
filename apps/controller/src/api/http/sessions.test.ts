import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ClaudeSessionSchema, TaskSchema, type DomainEvent } from "@claudeops/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { buildTestApp, type TestAppContext } from "../../test-support/build-test-app.js";

describe("/sessions", () => {
  let ctx: TestAppContext;
  let db: Database.Database;
  let app: Express;
  let projectDir: string;
  let projectId: string;

  beforeEach(async () => {
    ctx = buildTestApp();
    db = ctx.db;
    app = ctx.app;

    projectDir = mkdtempSync(join(tmpdir(), "claudeops-sessions-route-"));
    const project = await ctx.projectRegistry.registerProject({ name: "Website", path: projectDir });
    projectId = project.id;
  });

  afterEach(() => {
    db.close();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("POST / creates a session and returns 201 with a schema-valid body", async () => {
    const res = await request(app).post("/sessions").send({ projectId });

    expect(res.status).toBe(201);
    expect(ClaudeSessionSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.status).toBe("IDLE");
  });

  it("POST / with an initialInstruction also creates a persisted Task (the page12 gap-fix)", async () => {
    const res = await request(app)
      .post("/sessions")
      .send({ projectId, initialInstruction: "say hi" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("COMPLETED");

    const tasksRes = await request(app).get(`/sessions/${res.body.id as string}/tasks`);
    expect(tasksRes.status).toBe(200);
    expect(tasksRes.body).toHaveLength(1);
    expect(TaskSchema.safeParse(tasksRes.body[0]).success).toBe(true);
    expect(tasksRes.body[0].instruction).toBe("say hi");
    expect(tasksRes.body[0].status).toBe("COMPLETED");
  });

  it("POST / rejects an invalid body with 400", async () => {
    const res = await request(app).post("/sessions").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("POST / with an unknown projectId returns 404", async () => {
    const res = await request(app).post("/sessions").send({ projectId: "project_missing" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("PROJECT_NOT_FOUND");
  });

  it("GET / lists sessions, optionally filtered by projectId", async () => {
    await request(app).post("/sessions").send({ projectId });
    const otherDir = mkdtempSync(join(tmpdir(), "claudeops-sessions-route-other-"));
    const otherProject = await ctx.projectRegistry.registerProject({
      name: "Other",
      path: otherDir,
    });
    await request(app).post("/sessions").send({ projectId: otherProject.id });

    const all = await request(app).get("/sessions");
    expect(all.body).toHaveLength(2);

    const filtered = await request(app).get(`/sessions?projectId=${projectId}`);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].projectId).toBe(projectId);

    rmSync(otherDir, { recursive: true, force: true });
  });

  it("GET /:id inspects a session, 404s for an unknown one", async () => {
    const created = await request(app).post("/sessions").send({ projectId });

    const res = await request(app).get(`/sessions/${created.body.id as string}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);

    const notFound = await request(app).get("/sessions/session_missing");
    expect(notFound.status).toBe(404);
    expect(notFound.body.error).toBe("SESSION_NOT_FOUND");
  });

  it("GET /:id/events returns persisted, time-ordered events", async () => {
    const created = await request(app).post("/sessions").send({ projectId });
    await request(app)
      .post(`/sessions/${created.body.id as string}/instructions`)
      .send({ instruction: "do the thing" });
    await new Promise((r) => setTimeout(r, 10));

    const res = await request(app).get(`/sessions/${created.body.id as string}/events`);

    expect(res.status).toBe(200);
    const events = res.body as DomainEvent[];
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((e) => e.type)).toContain("SESSION_COMPLETED");
  });

  it("POST /:id/instructions dispatches and returns a Task", async () => {
    const created = await request(app).post("/sessions").send({ projectId });

    const res = await request(app)
      .post(`/sessions/${created.body.id as string}/instructions`)
      .send({ instruction: "fix the bug" });

    expect(res.status).toBe(201);
    expect(TaskSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.status).toBe("COMPLETED");
  });

  it("POST /:id/instructions rejects an empty instruction with 400", async () => {
    const created = await request(app).post("/sessions").send({ projectId });

    const res = await request(app)
      .post(`/sessions/${created.body.id as string}/instructions`)
      .send({ instruction: "" });

    expect(res.status).toBe(400);
  });

  it("POST /:id/resume transitions a stopped session back to WORKING", async () => {
    const created = await request(app).post("/sessions").send({ projectId });
    await request(app).post(`/sessions/${created.body.id as string}/stop`);

    const res = await request(app).post(`/sessions/${created.body.id as string}/resume`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("WORKING");
  });

  it("POST /:id/stop stops a session", async () => {
    const created = await request(app).post("/sessions").send({ projectId });

    const res = await request(app).post(`/sessions/${created.body.id as string}/stop`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("STOPPED");
  });

  it("POST /:id/cancel cancels the latest cancellable task", async () => {
    const created = await request(app).post("/sessions").send({ projectId });
    ctx.adapter.queueInstructionOutcome(created.body.id as string, "waiting_for_permission");
    await request(app)
      .post(`/sessions/${created.body.id as string}/instructions`)
      .send({ instruction: "risky" });

    const res = await request(app).post(`/sessions/${created.body.id as string}/cancel`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
  });

  it("POST /:id/cancel returns 400 when there is nothing cancellable", async () => {
    const created = await request(app).post("/sessions").send({ projectId });

    const res = await request(app).post(`/sessions/${created.body.id as string}/cancel`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_CANCEL_TARGET");
  });

  it("GET /:id/tasks returns task history in order", async () => {
    const created = await request(app).post("/sessions").send({ projectId });
    await request(app)
      .post(`/sessions/${created.body.id as string}/instructions`)
      .send({ instruction: "first" });
    await request(app)
      .post(`/sessions/${created.body.id as string}/instructions`)
      .send({ instruction: "second" });

    const res = await request(app).get(`/sessions/${created.body.id as string}/tasks`);

    expect(res.status).toBe(200);
    expect(res.body.map((t: { instruction: string }) => t.instruction)).toEqual([
      "first",
      "second",
    ]);
  });
});
