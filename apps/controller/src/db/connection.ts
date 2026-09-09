import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

export function resolveDataDir(dataDir: string): string {
  if (dataDir === "~" || dataDir.startsWith("~/") || dataDir.startsWith("~\\")) {
    return join(homedir(), dataDir.slice(1));
  }
  return dataDir;
}

export function openDatabase(dataDir: string): Database.Database {
  const resolved = resolveDataDir(dataDir);
  if (!existsSync(resolved)) {
    mkdirSync(resolved, { recursive: true });
  }

  const db = new Database(join(resolved, "data.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
