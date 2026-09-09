import type { ClaudeSession } from "@claudeops/protocol";

/** Same Promise-returning-interface reasoning as ProjectRepository (ADR-004). */
export interface SessionRepository {
  create(session: ClaudeSession): Promise<void>;
  findById(id: string): Promise<ClaudeSession | null>;
  list(): Promise<ClaudeSession[]>;
  listByProject(projectId: string): Promise<ClaudeSession[]>;
  update(session: ClaudeSession): Promise<void>;
  remove(id: string): Promise<void>;
}
