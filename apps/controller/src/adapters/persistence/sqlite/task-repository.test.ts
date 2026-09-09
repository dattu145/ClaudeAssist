import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject } from "../../../domain/project/entity.js";
import { createSession } from "../../../domain/session/entity.js";
import { createTask } from "../../../domain/task/entity.js";
import { runMigrations } from "../../../db/migrate.js";
import { SqliteProjectRepository } from "./project-repository.js";
import { SqliteSessionRepository } from "./session-repository.js";
import { SqliteTaskRepository } from "./task-repository.js";

describe("SqliteTaskRepository", () => {
  let dir: string;
  let db: Database.Database;
  let projectId: string;
  let sessionId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "claudeops-sqlite-task-"));
    db = new Database(join(dir, "data.db"));
    runMigrations(db);

    const project = createProject({ name: "Website", path: dir });
    await new SqliteProjectRepository(db).create(project);
    projectId = project.id;

    const session = createSession({ projectId });
    await new SqliteSessionRepository(db).create(session);
    sessionId = session.id;
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips create/find/listBySession/update", async () => {
    const repo = new SqliteTaskRepository(db);
    const task = createTask({ projectId, sessionId, instruction: "fix the bug" });
    await repo.create(task);

    expect(await repo.findById(task.id)).toEqual(task);
    expect(await repo.listBySession(sessionId)).toEqual([task]);
    expect(await repo.listBySession("session_other")).toEqual([]);

    const updated = { ...task, status: "RUNNING" as const, startedAt: new Date().toISOString() };
    await repo.update(updated);
    expect(await repo.findById(task.id)).toEqual(updated);
  });

  it("returns null for an unknown id", async () => {
    const repo = new SqliteTaskRepository(db);
    expect(await repo.findById("task_missing")).toBeNull();
  });

  it("blocks deleting a session that still has tasks (FK constraint, deliberate)", async () => {
    const repo = new SqliteTaskRepository(db);
    await repo.create(createTask({ projectId, sessionId, instruction: "fix the bug" }));

    expect(() => db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId)).toThrow();
  });
});
