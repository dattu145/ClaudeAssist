import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBordioLink } from "../../../domain/bordio/link.js";
import { runMigrations } from "../../../db/migrate.js";
import { SqliteBordioLinkRepository } from "./bordio-link-repository.js";

describe("SqliteBordioLinkRepository", () => {
  let db: Database.Database;
  let repo: SqliteBordioLinkRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    repo = new SqliteBordioLinkRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("upserts a link and finds it by claudeops entity", async () => {
    const link = createBordioLink("session", "session_1", "task_bordio_1");
    await repo.upsert(link);

    const found = await repo.findByClaudeOpsEntity("session", "session_1");
    expect(found?.bordioTaskId).toBe("task_bordio_1");
  });

  it("finds a link by bordio task id", async () => {
    const link = createBordioLink("session", "session_1", "task_bordio_1");
    await repo.upsert(link);

    const found = await repo.findByBordioTaskId("task_bordio_1");
    expect(found?.claudeopsEntityId).toBe("session_1");
  });

  it("returns null for an unknown entity or bordio task id", async () => {
    expect(await repo.findByClaudeOpsEntity("session", "nonexistent")).toBeNull();
    expect(await repo.findByBordioTaskId("nonexistent")).toBeNull();
  });

  it("a second upsert for the same entity updates the existing link rather than duplicating it", async () => {
    const first = createBordioLink("session", "session_1", "task_bordio_1");
    await repo.upsert(first);

    const second = createBordioLink("session", "session_1", "task_bordio_2");
    await repo.upsert(second);

    const rows = db.prepare("SELECT * FROM bordio_links").all();
    expect(rows).toHaveLength(1);

    const found = await repo.findByClaudeOpsEntity("session", "session_1");
    expect(found?.bordioTaskId).toBe("task_bordio_2");
  });
});
