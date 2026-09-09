import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject } from "../../../domain/project/entity.js";
import { createSession } from "../../../domain/session/entity.js";
import { runMigrations } from "../../../db/migrate.js";
import { SqliteProjectRepository } from "./project-repository.js";
import { SqliteSessionRepository } from "./session-repository.js";

describe("SqliteSessionRepository", () => {
  let dbFile: string;
  let dir: string;
  let db: Database.Database;
  let projectId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "claudeops-sqlite-session-"));
    dbFile = join(dir, "data.db");
    db = new Database(dbFile);
    runMigrations(db);

    const project = createProject({ name: "Website", path: dir });
    await new SqliteProjectRepository(db).create(project);
    projectId = project.id;
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips create/find/list/listByProject/update/remove", async () => {
    const repo = new SqliteSessionRepository(db);
    const session = createSession({ projectId });
    await repo.create(session);

    expect(await repo.findById(session.id)).toEqual(session);
    expect(await repo.list()).toEqual([session]);
    expect(await repo.listByProject(projectId)).toEqual([session]);
    expect(await repo.listByProject("project_other")).toEqual([]);

    const updated = { ...session, status: "IDLE" as const, lastActivityAt: new Date().toISOString() };
    await repo.update(updated);
    expect(await repo.findById(session.id)).toEqual(updated);

    await repo.remove(session.id);
    expect(await repo.findById(session.id)).toBeNull();
  });

  it("survives closing and reopening the database", async () => {
    const repo1 = new SqliteSessionRepository(db);
    const session = createSession({ projectId });
    await repo1.create(session);
    db.close();

    const db2 = new Database(dbFile);
    runMigrations(db2);
    const repo2 = new SqliteSessionRepository(db2);
    expect(await repo2.findById(session.id)).toEqual(session);
    db2.close();
  });

  it("blocks deleting a project that still has sessions (FK constraint, deliberate)", async () => {
    const repo = new SqliteSessionRepository(db);
    const session = createSession({ projectId });
    await repo.create(session);

    expect(() => db.prepare("DELETE FROM projects WHERE id = ?").run(projectId)).toThrow();
  });

  it("allows deleting a project once its sessions are removed", async () => {
    const repo = new SqliteSessionRepository(db);
    const session = createSession({ projectId });
    await repo.create(session);
    await repo.remove(session.id);

    expect(() => db.prepare("DELETE FROM projects WHERE id = ?").run(projectId)).not.toThrow();
  });
});
