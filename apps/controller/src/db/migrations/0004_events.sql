-- No foreign keys: an append-only event log must survive its referenced
-- project/session being removed later (see .claude/plans/page10.md).
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  project_id TEXT,
  session_id TEXT,
  task_id TEXT,
  payload TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE INDEX idx_events_session_id ON events(session_id);
