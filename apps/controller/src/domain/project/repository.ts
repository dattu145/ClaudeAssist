import type { Project } from "@claudeops/protocol";

/**
 * Promise-returning so a future non-SQLite implementation isn't forced to
 * be synchronous, even though better-sqlite3 itself is (see ADR-004).
 */
export interface ProjectRepository {
  create(project: Project): Promise<void>;
  findById(id: string): Promise<Project | null>;
  list(): Promise<Project[]>;
  update(project: Project): Promise<void>;
  remove(id: string): Promise<void>;
}
