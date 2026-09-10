-- No FK on claudeops_entity_id: it can reference different tables
-- depending on claudeops_entity_type (same reasoning pairing_codes/
-- pairing_tokens already document for their own no-FK choice).
CREATE TABLE bordio_links (
  id TEXT PRIMARY KEY,
  claudeops_entity_type TEXT NOT NULL,
  claudeops_entity_id TEXT NOT NULL,
  bordio_task_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_bordio_links_entity ON bordio_links(claudeops_entity_type, claudeops_entity_id);
CREATE INDEX idx_bordio_links_bordio_task_id ON bordio_links(bordio_task_id);

-- Named, not a single global row, in case a future page adds a second
-- independently-polled query.
CREATE TABLE bordio_poll_cursors (
  name TEXT PRIMARY KEY,
  etag TEXT,
  polled_at TEXT NOT NULL
);
