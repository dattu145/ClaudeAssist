-- First migration: proves the runner works. Real domain tables (projects,
-- sessions, tasks, events, pairings) land migration-by-migration alongside
-- the repository that needs them (page6, page9, page11, page14) rather than
-- being speculatively created here.
CREATE TABLE schema_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  applied_at TEXT NOT NULL
);

INSERT INTO schema_meta (id, applied_at) VALUES (1, CURRENT_TIMESTAMP);
