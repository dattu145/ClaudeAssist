import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { ProjectSchema } from "@claudeops/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request, { type Response } from "supertest";
import type { Express } from "express";
import { buildTestApp } from "../../test-support/build-test-app.js";

describe("/projects", () => {
  let db: Database.Database;
  let app: Express;
  let projectDir: string;

  beforeEach(() => {
    const ctx = buildTestApp();
    db = ctx.db;
    app = ctx.app;
    projectDir = mkdtempSync(join(tmpdir(), "claudeops-project-"));
  });

  afterEach(() => {
    db.close();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("creates a project and returns 201 with a schema-valid body", async () => {
    const res: Response = await request(app)
      .post("/projects")
      .send({ name: "Website", path: projectDir });

    expect(res.status).toBe(201);
    expect(ProjectSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.id).toMatch(/^project_/);
    expect(res.body.status).toBe("active");
  });

  it("rejects a nonexistent path with 400", async () => {
    const res = await request(app)
      .post("/projects")
      .send({ name: "Ghost", path: join(projectDir, "does-not-exist") });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_PROJECT_PATH");
  });

  it("rejects an invalid body with 400", async () => {
    const res = await request(app).post("/projects").send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });

  it("lists created projects", async () => {
    await request(app).post("/projects").send({ name: "Website", path: projectDir });

    const res = await request(app).get("/projects");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });

  it("inspects a project by id", async () => {
    const created = await request(app)
      .post("/projects")
      .send({ name: "Website", path: projectDir });

    const res = await request(app).get(`/projects/${created.body.id as string}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("returns 404 for an unknown project id", async () => {
    const res = await request(app).get("/projects/project_does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("PROJECT_NOT_FOUND");
  });
});
