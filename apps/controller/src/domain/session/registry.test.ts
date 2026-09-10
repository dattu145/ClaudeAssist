import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createLogger } from "@claudeops/logging";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../db/migrate.js";
import { SqliteProjectRepository } from "../../adapters/persistence/sqlite/project-repository.js";
import { SqliteSessionRepository } from "../../adapters/persistence/sqlite/session-repository.js";
import { FakeClaudeSessionAdapter } from "../../adapters/fake/fake-claude-session-adapter.js";
import { ProjectRegistry } from "../project/registry.js";
import { ProjectNotFoundError, SessionNotFoundError } from "../errors.js";
import { InProcessEventBus, type EventBus } from "../events/bus.js";
import { SessionRegistry } from "./registry.js";

describe("SessionRegistry", () => {
  let db: Database.Database;
  let projectDir: string;
  let projectRegistry: ProjectRegistry;
  let sessionRegistry: SessionRegistry;
  let adapter: FakeClaudeSessionAdapter;
  let eventBus: EventBus;
  let projectId: string;

  beforeEach(async () => {
    db = new Database(":memory:");
    runMigrations(db);
    projectDir = mkdtempSync(join(tmpdir(), "claudeops-session-registry-"));

    projectRegistry = new ProjectRegistry(new SqliteProjectRepository(db));
    adapter = new FakeClaudeSessionAdapter(createLogger({ component: "test" }, { write: () => {} }));
    eventBus = new InProcessEventBus(createLogger({ component: "test" }, { write: () => {} }));
    sessionRegistry = new SessionRegistry(
      new SqliteSessionRepository(db),
      adapter,
      projectRegistry,
      eventBus
    );

    const project = await projectRegistry.registerProject({ name: "Website", path: projectDir });
    projectId = project.id;
  });

  afterEach(() => {
    db.close();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("starts a session without an initial instruction, landing in IDLE", async () => {
    const session = await sessionRegistry.startSession({ projectId });

    expect(session.status).toBe("IDLE");
    expect(session.projectId).toBe(projectId);

    const persisted = await sessionRegistry.getSession(session.id);
    expect(persisted).toEqual(session);
  });

  it("starts a session with an initial instruction and persists the completed state", async () => {
    const session = await sessionRegistry.startSession({
      projectId,
      initialInstruction: "say hi",
    });

    expect(session.status).toBe("COMPLETED");
    const persisted = await sessionRegistry.getSession(session.id);
    expect(persisted.status).toBe("COMPLETED");
  });

  it("throws ProjectNotFoundError when starting a session for an unknown project", async () => {
    await expect(
      sessionRegistry.startSession({ projectId: "project_missing" })
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it("throws SessionNotFoundError for an unknown session", async () => {
    await expect(sessionRegistry.getSession("session_missing")).rejects.toBeInstanceOf(
      SessionNotFoundError
    );
  });

  it("sendInstruction dispatches and re-syncs persisted state from the adapter", async () => {
    const started = await sessionRegistry.startSession({ projectId });
    adapter.queueInstructionOutcome(started.id, "waiting_for_permission");

    const result = await sessionRegistry.sendInstruction(started.id, "do something risky");

    expect(result.status).toBe("waiting_for_permission");
    const persisted = await sessionRegistry.getSession(started.id);
    expect(persisted.status).toBe("WAITING_FOR_PERMISSION");
    expect(persisted.lastOutput).toContain("do something risky");
  });

  it("sendInstruction on an unknown session throws SessionNotFoundError", async () => {
    await expect(
      sessionRegistry.sendInstruction("session_missing", "hi")
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("stopSession persists STOPPED", async () => {
    const started = await sessionRegistry.startSession({ projectId });

    await sessionRegistry.stopSession(started.id);

    const persisted = await sessionRegistry.getSession(started.id);
    expect(persisted.status).toBe("STOPPED");
  });

  it("resumeSession persists WORKING after a stop", async () => {
    const started = await sessionRegistry.startSession({ projectId });
    await sessionRegistry.stopSession(started.id);

    const resumed = await sessionRegistry.resumeSession(started.id);

    expect(resumed.status).toBe("WORKING");
    const persisted = await sessionRegistry.getSession(started.id);
    expect(persisted.status).toBe("WORKING");
  });

  it("listSessions filters by project", async () => {
    const otherDir = mkdtempSync(join(tmpdir(), "claudeops-session-registry-other-"));
    const otherProject = await projectRegistry.registerProject({
      name: "Other",
      path: otherDir,
    });

    await sessionRegistry.startSession({ projectId });
    await sessionRegistry.startSession({ projectId: otherProject.id });

    const forFirst = await sessionRegistry.listSessions(projectId);
    expect(forFirst).toHaveLength(1);
    expect(forFirst[0]?.projectId).toBe(projectId);

    const all = await sessionRegistry.listSessions();
    expect(all).toHaveLength(2);

    rmSync(otherDir, { recursive: true, force: true });
  });

  it("subscribe delegates to the adapter and delivers real dispatch events", async () => {
    const started = await sessionRegistry.startSession({ projectId });
    const events: string[] = [];
    sessionRegistry.subscribe(started.id, (e) => events.push(e.type));

    await sessionRegistry.sendInstruction(started.id, "go");

    expect(events).toContain("output");
    expect(events).toContain("status_changed");
    expect(events).toContain("completed");
  });

  it("publishes translated DomainEvents to the event bus for later instructions", async () => {
    const started = await sessionRegistry.startSession({ projectId });
    const published: string[] = [];
    eventBus.subscribe((e) => published.push(e.type));

    await sessionRegistry.sendInstruction(started.id, "go");

    expect(published).toContain("SESSION_OUTPUT");
    expect(published).toContain("SESSION_COMPLETED");
  });

  it("resumeSession rehydrates a session the adapter doesn't know about (simulates a restart) and forwards its events to the bus", async () => {
    const started = await sessionRegistry.startSession({ projectId });
    await sessionRegistry.stopSession(started.id);

    // A fresh adapter/registry sharing the same SQLite repository —
    // exactly what a real restart produces (page16): the persisted
    // session exists, the adapter's in-memory record does not.
    const freshAdapter = new FakeClaudeSessionAdapter(
      createLogger({ component: "test" }, { write: () => {} })
    );
    const freshEventBus = new InProcessEventBus(createLogger({ component: "test" }, { write: () => {} }));
    const freshSessionRegistry = new SessionRegistry(
      new SqliteSessionRepository(db),
      freshAdapter,
      projectRegistry,
      freshEventBus
    );
    const published: string[] = [];
    freshEventBus.subscribe((e) => published.push(e.type));

    const resumed = await freshSessionRegistry.resumeSession(started.id);
    expect(resumed.status).toBe("WORKING");

    await freshSessionRegistry.sendInstruction(started.id, "continue");
    expect(published).toContain("SESSION_OUTPUT");
    expect(published).toContain("SESSION_COMPLETED");
  });

  it("does not double-subscribe (no duplicate event delivery) for a session already known to the adapter", async () => {
    const started = await sessionRegistry.startSession({ projectId });
    const published: string[] = [];
    eventBus.subscribe((e) => published.push(e.type));

    await sessionRegistry.sendInstruction(started.id, "first");
    await sessionRegistry.sendInstruction(started.id, "second");

    const completedCount = published.filter((t) => t === "SESSION_COMPLETED").length;
    expect(completedCount).toBe(2); // one per dispatch, not doubled by a duplicate subscription
  });

  it("does not miss the initial-instruction dispatch's events (the page10 timing fix)", async () => {
    const published: string[] = [];
    eventBus.subscribe((e) => published.push(e.type));

    const session = await sessionRegistry.startSession({
      projectId,
      initialInstruction: "say hi",
    });

    expect(session.status).toBe("COMPLETED");
    // These fired *inside* adapter.startSession, before it returned — a
    // registry subscribing only afterward would have missed all of them.
    expect(published).toContain("SESSION_OUTPUT");
    expect(published).toContain("SESSION_COMPLETED");
    expect(published.every((type) => typeof type === "string")).toBe(true);
    expect(published.length).toBeGreaterThan(0);
  });
});
