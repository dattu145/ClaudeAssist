import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createLogger } from "@claudeops/logging";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../server.js";
import { runMigrations } from "../../db/migrate.js";
import { SqliteProjectRepository } from "../../adapters/persistence/sqlite/project-repository.js";
import { SqliteSessionRepository } from "../../adapters/persistence/sqlite/session-repository.js";
import { SqliteEventRepository } from "../../adapters/persistence/sqlite/event-repository.js";
import { FakeClaudeSessionAdapter } from "../../adapters/fake/fake-claude-session-adapter.js";
import { ProjectRegistry } from "../../domain/project/registry.js";
import { SessionRegistry } from "../../domain/session/registry.js";
import { InProcessEventBus } from "../../domain/events/bus.js";
import { wireEventPersistence } from "../../domain/events/wire-persistence.js";

describe("/sessions/:id/events", () => {
  let db: Database.Database;
  let app: Express;
  let projectDir: string;
  let sessionRegistry: SessionRegistry;
  let projectId: string;

  beforeEach(async () => {
    db = new Database(":memory:");
    runMigrations(db);
    const logger = createLogger({ component: "test" }, { write: () => {} });

    const projectRegistry = new ProjectRegistry(new SqliteProjectRepository(db));
    const eventBus = new InProcessEventBus(logger);
    const eventRepository = new SqliteEventRepository(db);
    wireEventPersistence(eventBus, eventRepository, logger);

    sessionRegistry = new SessionRegistry(
      new SqliteSessionRepository(db),
      new FakeClaudeSessionAdapter(logger),
      projectRegistry,
      eventBus
    );

    app = createApp({
      db,
      startedAt: Date.now(),
      logger,
      checkClaudeCli: () => Promise.resolve(true),
      projectRegistry,
      sessionRegistry,
      eventRepository,
    });

    projectDir = mkdtempSync(join(tmpdir(), "claudeops-session-events-"));
    const project = await projectRegistry.registerProject({ name: "Website", path: projectDir });
    projectId = project.id;
  });

  afterEach(() => {
    db.close();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("returns the persisted, time-ordered events for a session", async () => {
    const session = await sessionRegistry.startSession({ projectId });
    await sessionRegistry.sendInstruction(session.id, "do the thing");
    // publish() is synchronous but repository.create() inside
    // wireEventPersistence is async — give its microtasks a tick.
    await new Promise((r) => setTimeout(r, 10));

    const res = await request(app).get(`/sessions/${session.id}/events`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((e: { sessionId: string }) => e.sessionId === session.id)).toBe(true);
    const types = res.body.map((e: { type: string }) => e.type);
    expect(types).toContain("SESSION_OUTPUT");
    expect(types).toContain("SESSION_COMPLETED");
  });

  it("returns 404 for an unknown session", async () => {
    const res = await request(app).get("/sessions/session_missing/events");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("SESSION_NOT_FOUND");
  });
});
