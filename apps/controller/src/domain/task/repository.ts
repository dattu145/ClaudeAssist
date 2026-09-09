import type { Task } from "@claudeops/protocol";

export interface TaskRepository {
  create(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  listBySession(sessionId: string): Promise<Task[]>;
  update(task: Task): Promise<void>;
}
