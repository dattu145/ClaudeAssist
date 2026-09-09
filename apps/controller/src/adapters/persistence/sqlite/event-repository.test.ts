import Database from "better-sqlite3";
import type { DomainEvent } from "@claudeops/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../../db/migrate.js";
import { SqliteEventRepository } from "./event-repository.js";

function sampleEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "event_1",
    type: "SESSION_OUTPUT",
    timestamp: new Date().toISOString(),
    sessionId: "session_1",
    projectId: "project_1",
    payload: { output: "hi", nested: { ok: true } },
    source: "controller",
    ...overrides,
  };
}

describe("SqliteEventRepository", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it("persists and lists events by session, in timestamp order", async () => {
    const repo = new SqliteEventRepository(db);
    const first = sampleEvent({ id: "event_1", timestamp: "2026-01-01T00:00:00.000Z" });
    const second = sampleEvent({
      id: "event_2",
      type: "SESSION_COMPLETED",
      timestamp: "2026-01-01T00:00:01.000Z",
    });
    await repo.create(second);
    await repo.create(first);

    const events = await repo.listBySession("session_1");

    expect(events.map((e) => e.id)).toEqual(["event_1", "event_2"]);
    expect(events[0]?.payload).toEqual({ output: "hi", nested: { ok: true } });
  });

  it("round-trips optional correlation ids correctly (omitted, not null, when absent)", async () => {
    const repo = new SqliteEventRepository(db);
    const { projectId: _p, ...withoutProjectId } = sampleEvent();
    await repo.create(withoutProjectId as DomainEvent);

    const [event] = await repo.listBySession("session_1");
    expect(event?.projectId).toBeUndefined();
  });

  it("returns an empty list for a session with no events", async () => {
    const repo = new SqliteEventRepository(db);
    expect(await repo.listBySession("session_missing")).toEqual([]);
  });

  it("respects the limit parameter", async () => {
    const repo = new SqliteEventRepository(db);
    for (let i = 0; i < 5; i += 1) {
      await repo.create(
        sampleEvent({ id: `event_${i}`, timestamp: `2026-01-01T00:00:0${i}.000Z` })
      );
    }

    const events = await repo.listBySession("session_1", 2);
    expect(events).toHaveLength(2);
  });
});
