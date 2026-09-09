import type { DomainEvent } from "@claudeops/protocol";

export interface EventRepository {
  create(event: DomainEvent): Promise<void>;
  listBySession(sessionId: string, limit?: number): Promise<DomainEvent[]>;
}
