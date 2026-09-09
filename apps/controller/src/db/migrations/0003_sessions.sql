-- No ON DELETE clause: with foreign_keys=ON (page4), SQLite's default
-- behavior blocks deleting a project that still has sessions. Deliberate
-- (see .claude/plans/page9.md) — a project can't be silently orphaned out
-- from under its sessions. Revisit if cascade-delete is ever the desired
-- product behavior; it's a one-line migration change, not a design that
-- needed guessing now.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  claude_session_id TEXT,
  status TEXT NOT NULL,
  current_task TEXT,
  process_id INTEGER,
  terminal_id TEXT,
  last_output TEXT,
  last_error TEXT,
  started_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL
);

CREATE INDEX idx_sessions_project_id ON sessions(project_id);
