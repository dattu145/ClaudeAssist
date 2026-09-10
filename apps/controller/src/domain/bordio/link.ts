import { generateId, nowIso } from "@claudeops/shared";

/** The only value used so far (pageB3 mirrors session lifecycle, not
 * individual tasks — .claude/plans/pageB2.md's Design section explains
 * why). Kept as a string, not a literal union, so a future entity type
 * doesn't require touching every call site that just passes it through. */
export type BordioLinkedEntityType = "session";

export interface BordioLink {
  id: string;
  claudeopsEntityType: BordioLinkedEntityType;
  claudeopsEntityId: string;
  bordioTaskId: string;
  createdAt: string;
  updatedAt: string;
}

export function createBordioLink(
  claudeopsEntityType: BordioLinkedEntityType,
  claudeopsEntityId: string,
  bordioTaskId: string
): BordioLink {
  const now = nowIso();
  return {
    id: generateId("bordio_link"),
    claudeopsEntityType,
    claudeopsEntityId,
    bordioTaskId,
    createdAt: now,
    updatedAt: now,
  };
}
