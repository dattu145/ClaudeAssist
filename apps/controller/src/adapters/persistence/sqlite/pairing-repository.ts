import type { Database } from "better-sqlite3";
import { nowIso } from "@claudeops/shared";
import type { PairingRepository } from "../../../domain/pairing/repository.js";
import type { PairingCodeRecord, PairingTokenRecord } from "../../../domain/pairing/entity.js";

interface PairingCodeRow {
  id: string;
  code: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

interface PairingTokenRow {
  id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

function rowToCode(row: PairingCodeRow): PairingCodeRecord {
  return {
    id: row.id,
    code: row.code,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
}

function rowToToken(row: PairingTokenRow): PairingTokenRecord {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
  };
}

export class SqlitePairingRepository implements PairingRepository {
  constructor(private readonly db: Database) {}

  async createCode(record: PairingCodeRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO pairing_codes (id, code, created_at, expires_at, consumed_at)
         VALUES (@id, @code, @createdAt, @expiresAt, @consumedAt)`
      )
      .run(record);
  }

  async findActiveCodeByValue(code: string): Promise<PairingCodeRecord | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM pairing_codes
         WHERE code = ? AND consumed_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(code, nowIso()) as PairingCodeRow | undefined;
    return row ? rowToCode(row) : null;
  }

  async consumeCode(id: string): Promise<void> {
    this.db
      .prepare("UPDATE pairing_codes SET consumed_at = ? WHERE id = ?")
      .run(nowIso(), id);
  }

  async invalidateAllCodes(): Promise<void> {
    this.db
      .prepare("UPDATE pairing_codes SET consumed_at = ? WHERE consumed_at IS NULL")
      .run(nowIso());
  }

  async createToken(record: PairingTokenRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO pairing_tokens (id, token_hash, created_at, expires_at, revoked_at, last_used_at)
         VALUES (@id, @tokenHash, @createdAt, @expiresAt, @revokedAt, @lastUsedAt)`
      )
      .run(record);
  }

  async findActiveTokenByHash(tokenHash: string): Promise<PairingTokenRecord | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM pairing_tokens
         WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`
      )
      .get(tokenHash, nowIso()) as PairingTokenRow | undefined;
    return row ? rowToToken(row) : null;
  }

  async touchTokenLastUsed(id: string): Promise<void> {
    this.db.prepare("UPDATE pairing_tokens SET last_used_at = ? WHERE id = ?").run(nowIso(), id);
  }

  async revokeToken(id: string): Promise<void> {
    this.db.prepare("UPDATE pairing_tokens SET revoked_at = ? WHERE id = ?").run(nowIso(), id);
  }
}
