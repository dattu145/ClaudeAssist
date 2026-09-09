import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject } from "../../../domain/project/entity.js";
import { runMigrations } from "../../../db/migrate.js";
import { SqliteProjectRepository } from "./project-repository.js";

describe("SqliteProjectRepository", () => {
  let dbFile: string;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "claudeops-sqlite-project-"));
    dbFile = join(dir, "data.db");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips create/find/list/update/remove", async () => {
    const db = new Database(dbFile);
    runMigrations(db);
    const repo = new SqliteProjectRepository(db);

    const project = createProject({ name: "Website", path: "/x/y" });
    await repo.create(project);

    expect(await repo.findById(project.id)).toEqual(project);
    expect(await repo.list()).toEqual([project]);

    const updated = { ...project, name: "Renamed", updatedAt: new Date().toISOString() };
    await repo.update(updated);
    expect(await repo.findById(project.id)).toEqual(updated);

    await repo.remove(project.id);
    expect(await repo.findById(project.id)).toBeNull();

    db.close();
  });

  it("survives closing and reopening the database (persistence across restarts)", async () => {
    const db1 = new Database(dbFile);
    runMigrations(db1);
    const repo1 = new SqliteProjectRepository(db1);
    const project = createProject({ name: "Website", path: "/x/y" });
    await repo1.create(project);
    db1.close();

    const db2 = new Database(dbFile);
    runMigrations(db2);
    const repo2 = new SqliteProjectRepository(db2);
    expect(await repo2.findById(project.id)).toEqual(project);
    db2.close();
  });

  it("returns null for an unknown id", async () => {
    const db = new Database(dbFile);
    runMigrations(db);
    const repo = new SqliteProjectRepository(db);

    expect(await repo.findById("project_missing")).toBeNull();
    db.close();
  });
});
