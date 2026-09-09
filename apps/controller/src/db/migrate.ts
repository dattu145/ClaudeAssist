import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "better-sqlite3";

const DEFAULT_MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/**
 * Hand-rolled, deliberately minimal: applies un-applied .sql files from
 * `migrationsDir`, in filename order, each in its own transaction, tracked
 * in a `migrations` table. No down-migrations, no branching — if Phase 1
 * ever needs those, that's a signal to adopt a real migration tool instead
 * of growing this one (see .claude/plans/page4.md Risks).
 */
export function runMigrations(db: Database, migrationsDir: string = DEFAULT_MIGRATIONS_DIR): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db.prepare("SELECT filename FROM migrations").all().map((row) => (row as { filename: string }).filename)
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const newlyApplied: string[] = [];

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO migrations (filename, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString()
      );
    });
    apply();
    newlyApplied.push(file);
  }

  return newlyApplied;
}
