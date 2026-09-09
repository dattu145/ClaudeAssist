import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate.js";

describe("runMigrations", () => {
  let db: Database.Database;
  let migrationsDir: string;

  beforeEach(() => {
    db = new Database(":memory:");
    migrationsDir = mkdtempSync(join(tmpdir(), "claudeops-migrations-"));
    writeFileSync(
      join(migrationsDir, "0001_init.sql"),
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY);"
    );
    writeFileSync(
      join(migrationsDir, "0002_seed.sql"),
      "INSERT INTO widgets (id) VALUES (1);"
    );
  });

  afterEach(() => {
    db.close();
  });

  it("applies migrations in filename order", () => {
    const applied = runMigrations(db, migrationsDir);
    expect(applied).toEqual(["0001_init.sql", "0002_seed.sql"]);

    const rows = db.prepare("SELECT * FROM widgets").all();
    expect(rows).toEqual([{ id: 1 }]);
  });

  it("does not reapply already-applied migrations", () => {
    runMigrations(db, migrationsDir);
    const secondRun = runMigrations(db, migrationsDir);
    expect(secondRun).toEqual([]);

    const rows = db.prepare("SELECT * FROM widgets").all();
    expect(rows).toHaveLength(1);
  });

  it("applies only newly-added migrations on a later run", () => {
    runMigrations(db, migrationsDir);
    writeFileSync(join(migrationsDir, "0003_more"), "-- not a .sql file, ignored");
    writeFileSync(
      join(migrationsDir, "0003_more.sql"),
      "ALTER TABLE widgets ADD COLUMN name TEXT;"
    );

    const applied = runMigrations(db, migrationsDir);
    expect(applied).toEqual(["0003_more.sql"]);
  });
});
