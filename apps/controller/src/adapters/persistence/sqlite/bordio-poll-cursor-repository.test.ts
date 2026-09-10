import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../../db/migrate.js";
import { SqliteBordioPollCursorRepository } from "./bordio-poll-cursor-repository.js";

describe("SqliteBordioPollCursorRepository", () => {
  let db: Database.Database;
  let repo: SqliteBordioPollCursorRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    repo = new SqliteBordioPollCursorRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("returns null for a cursor that has never been set", async () => {
    expect(await repo.get("inbound-tasks")).toBeNull();
  });

  it("sets and gets a cursor", async () => {
    await repo.set("inbound-tasks", '"etag-1"', "2026-09-10T00:00:00.000Z");

    const cursor = await repo.get("inbound-tasks");
    expect(cursor).toEqual({ name: "inbound-tasks", etag: '"etag-1"', polledAt: "2026-09-10T00:00:00.000Z" });
  });

  it("a second set updates the existing cursor rather than duplicating it", async () => {
    await repo.set("inbound-tasks", '"etag-1"', "2026-09-10T00:00:00.000Z");
    await repo.set("inbound-tasks", '"etag-2"', "2026-09-10T00:05:00.000Z");

    const rows = db.prepare("SELECT * FROM bordio_poll_cursors").all();
    expect(rows).toHaveLength(1);

    const cursor = await repo.get("inbound-tasks");
    expect(cursor?.etag).toBe('"etag-2"');
    expect(cursor?.polledAt).toBe("2026-09-10T00:05:00.000Z");
  });

  it("supports a null etag (e.g. before the first successful poll)", async () => {
    await repo.set("inbound-tasks", null, "2026-09-10T00:00:00.000Z");

    const cursor = await repo.get("inbound-tasks");
    expect(cursor?.etag).toBeNull();
  });

  it("keeps independently-named cursors separate", async () => {
    await repo.set("inbound-tasks", '"a"', "2026-09-10T00:00:00.000Z");
    await repo.set("outbound-sync", '"b"', "2026-09-10T00:00:00.000Z");

    expect((await repo.get("inbound-tasks"))?.etag).toBe('"a"');
    expect((await repo.get("outbound-sync"))?.etag).toBe('"b"');
  });
});
