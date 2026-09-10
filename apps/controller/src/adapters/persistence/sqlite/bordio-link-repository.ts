import type { Database } from "better-sqlite3";
import { nowIso } from "@claudeops/shared";
import type { BordioLinkRepository } from "../../../domain/bordio/link-repository.js";
import type { BordioLink, BordioLinkedEntityType } from "../../../domain/bordio/link.js";

interface BordioLinkRow {
  id: string;
  claudeops_entity_type: string;
  claudeops_entity_id: string;
  bordio_task_id: string;
  created_at: string;
  updated_at: string;
}

function rowToLink(row: BordioLinkRow): BordioLink {
  return {
    id: row.id,
    claudeopsEntityType: row.claudeops_entity_type as BordioLinkedEntityType,
    claudeopsEntityId: row.claudeops_entity_id,
    bordioTaskId: row.bordio_task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteBordioLinkRepository implements BordioLinkRepository {
  constructor(private readonly db: Database) {}

  async upsert(link: BordioLink): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO bordio_links (id, claudeops_entity_type, claudeops_entity_id, bordio_task_id, created_at, updated_at)
         VALUES (@id, @claudeopsEntityType, @claudeopsEntityId, @bordioTaskId, @createdAt, @updatedAt)
         ON CONFLICT(claudeops_entity_type, claudeops_entity_id)
         DO UPDATE SET bordio_task_id = excluded.bordio_task_id, updated_at = excluded.updated_at`
      )
      .run({ ...link, updatedAt: nowIso() });
  }

  async findByClaudeOpsEntity(type: BordioLinkedEntityType, id: string): Promise<BordioLink | null> {
    const row = this.db
      .prepare("SELECT * FROM bordio_links WHERE claudeops_entity_type = ? AND claudeops_entity_id = ?")
      .get(type, id) as BordioLinkRow | undefined;
    return row ? rowToLink(row) : null;
  }

  async findByBordioTaskId(bordioTaskId: string): Promise<BordioLink | null> {
    const row = this.db
      .prepare("SELECT * FROM bordio_links WHERE bordio_task_id = ?")
      .get(bordioTaskId) as BordioLinkRow | undefined;
    return row ? rowToLink(row) : null;
  }
}
