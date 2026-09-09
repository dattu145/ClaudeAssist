-- No FK relationships to projects/sessions/tasks: pairing is
-- controller-identity-level, not domain data.
CREATE TABLE pairing_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX idx_pairing_codes_code ON pairing_codes(code);

CREATE TABLE pairing_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT
);

CREATE INDEX idx_pairing_tokens_token_hash ON pairing_tokens(token_hash);
