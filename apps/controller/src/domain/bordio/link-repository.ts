import type { BordioLink, BordioLinkedEntityType } from "./link.js";

export interface BordioLinkRepository {
  /** Inserts a new link, or updates `bordioTaskId`/`updatedAt` on the
   * existing one for this (type, id) pair — enforced by a unique index,
   * not application-level find-then-write. */
  upsert(link: BordioLink): Promise<void>;
  findByClaudeOpsEntity(
    type: BordioLinkedEntityType,
    id: string
  ): Promise<BordioLink | null>;
  findByBordioTaskId(bordioTaskId: string): Promise<BordioLink | null>;
}
