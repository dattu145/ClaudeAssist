import type { Database } from "better-sqlite3";
import { DomainEventSchema, type DomainEvent } from "@claudeops/protocol";
import type { EventRepository } from "../../../domain/events/repository.js";

interface EventRow {
  id: string;
  type: string;
  timestamp: string;
  project_id: string | null;
  session_id: string | null;
  task_id: string | null;
  payload: string;
  source: string;
}

function rowToEvent(row: EventRow): DomainEvent {
  return DomainEventSchema.parse({
    id: row.id,
    type: row.type,
    timestamp: row.timestamp,
    payload: JSON.parse(row.payload) as unknown,
    source: row.source,
    ...(row.project_id !== null ? { projectId: row.project_id } : {}),
    ...(row.session_id !== null ? { sessionId: row.session_id } : {}),
    ...(row.task_id !== null ? { taskId: row.task_id } : {}),
  });
}

const DEFAULT_LIST_LIMIT = 100;

export class SqliteEventRepository implements EventRepository {
  constructor(private readonly db: Database) {}

  async create(event: DomainEvent): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO events (id, type, timestamp, project_id, session_id, task_id, payload, source)
         VALUES (@id, @type, @timestamp, @projectId, @sessionId, @taskId, @payload, @source)`
      )
      .run({
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        projectId: event.projectId ?? null,
        sessionId: event.sessionId ?? null,
        taskId: event.taskId ?? null,
        payload: JSON.stringify(event.payload),
        source: event.source,
      });
  }

  async listBySession(sessionId: string, limit: number = DEFAULT_LIST_LIMIT): Promise<DomainEvent[]> {
    const rows = this.db
      .prepare("SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC LIMIT ?")
      .all(sessionId, limit) as EventRow[];
    return rows.map(rowToEvent);
  }
}
