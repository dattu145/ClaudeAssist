import type { Database } from "better-sqlite3";
import type { BordioPollCursorRepository } from "../../../domain/bordio/poll-cursor-repository.js";
import type { BordioPollCursor } from "../../../domain/bordio/poll-cursor.js";

interface BordioPollCursorRow {
  name: string;
  etag: string | null;
  polled_at: string;
}

export class SqliteBordioPollCursorRepository implements BordioPollCursorRepository {
  constructor(private readonly db: Database) {}

  async get(name: string): Promise<BordioPollCursor | null> {
    const row = this.db.prepare("SELECT * FROM bordio_poll_cursors WHERE name = ?").get(name) as
      | BordioPollCursorRow
      | undefined;
    return row ? { name: row.name, etag: row.etag, polledAt: row.polled_at } : null;
  }

  async set(name: string, etag: string | null, polledAt: string): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO bordio_poll_cursors (name, etag, polled_at)
         VALUES (@name, @etag, @polledAt)
         ON CONFLICT(name) DO UPDATE SET etag = excluded.etag, polled_at = excluded.polled_at`
      )
      .run({ name, etag, polledAt });
  }
}
