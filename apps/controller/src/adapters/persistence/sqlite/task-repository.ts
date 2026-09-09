import type { Database } from "better-sqlite3";
import { TaskSchema, type Task } from "@claudeops/protocol";
import type { TaskRepository } from "../../../domain/task/repository.js";

interface TaskRow {
  id: string;
  project_id: string;
  session_id: string;
  instruction: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

function rowToTask(row: TaskRow): Task {
  return TaskSchema.parse({
    id: row.id,
    projectId: row.project_id,
    sessionId: row.session_id,
    instruction: row.instruction,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  });
}

function toParams(task: Task) {
  return {
    id: task.id,
    projectId: task.projectId,
    sessionId: task.sessionId,
    instruction: task.instruction,
    status: task.status,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
  };
}

export class SqliteTaskRepository implements TaskRepository {
  constructor(private readonly db: Database) {}

  async create(task: Task): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO tasks (id, project_id, session_id, instruction, status, created_at, started_at, completed_at)
         VALUES (@id, @projectId, @sessionId, @instruction, @status, @createdAt, @startedAt, @completedAt)`
      )
      .run(toParams(task));
  }

  async findById(id: string): Promise<Task | null> {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
    return row ? rowToTask(row) : null;
  }

  async listBySession(sessionId: string): Promise<Task[]> {
    const rows = this.db
      .prepare("SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as TaskRow[];
    return rows.map(rowToTask);
  }

  async update(task: Task): Promise<void> {
    this.db
      .prepare(
        `UPDATE tasks
         SET status = @status, started_at = @startedAt, completed_at = @completedAt
         WHERE id = @id`
      )
      .run(toParams(task));
  }
}
