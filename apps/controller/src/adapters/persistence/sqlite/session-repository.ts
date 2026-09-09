import type { Database } from "better-sqlite3";
import { ClaudeSessionSchema, type ClaudeSession } from "@claudeops/protocol";
import type { SessionRepository } from "../../../domain/session/repository.js";

interface SessionRow {
  id: string;
  project_id: string;
  claude_session_id: string | null;
  status: string;
  current_task: string | null;
  process_id: number | null;
  terminal_id: string | null;
  last_output: string | null;
  last_error: string | null;
  started_at: string;
  last_activity_at: string;
}

function rowToSession(row: SessionRow): ClaudeSession {
  return ClaudeSessionSchema.parse({
    id: row.id,
    projectId: row.project_id,
    claudeSessionId: row.claude_session_id,
    status: row.status,
    currentTask: row.current_task,
    processId: row.process_id,
    terminalId: row.terminal_id,
    lastOutput: row.last_output,
    lastError: row.last_error,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
  });
}

function toParams(session: ClaudeSession) {
  return {
    id: session.id,
    projectId: session.projectId,
    claudeSessionId: session.claudeSessionId,
    status: session.status,
    currentTask: session.currentTask,
    processId: session.processId,
    terminalId: session.terminalId,
    lastOutput: session.lastOutput,
    lastError: session.lastError,
    startedAt: session.startedAt,
    lastActivityAt: session.lastActivityAt,
  };
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  async create(session: ClaudeSession): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessions
           (id, project_id, claude_session_id, status, current_task, process_id,
            terminal_id, last_output, last_error, started_at, last_activity_at)
         VALUES
           (@id, @projectId, @claudeSessionId, @status, @currentTask, @processId,
            @terminalId, @lastOutput, @lastError, @startedAt, @lastActivityAt)`
      )
      .run(toParams(session));
  }

  async findById(id: string): Promise<ClaudeSession | null> {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      | SessionRow
      | undefined;
    return row ? rowToSession(row) : null;
  }

  async list(): Promise<ClaudeSession[]> {
    const rows = this.db.prepare("SELECT * FROM sessions ORDER BY started_at ASC").all() as
      SessionRow[];
    return rows.map(rowToSession);
  }

  async listByProject(projectId: string): Promise<ClaudeSession[]> {
    const rows = this.db
      .prepare("SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at ASC")
      .all(projectId) as SessionRow[];
    return rows.map(rowToSession);
  }

  async update(session: ClaudeSession): Promise<void> {
    this.db
      .prepare(
        `UPDATE sessions
         SET claude_session_id = @claudeSessionId,
             status = @status,
             current_task = @currentTask,
             process_id = @processId,
             terminal_id = @terminalId,
             last_output = @lastOutput,
             last_error = @lastError,
             last_activity_at = @lastActivityAt
         WHERE id = @id`
      )
      .run(toParams(session));
  }

  async remove(id: string): Promise<void> {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }
}
