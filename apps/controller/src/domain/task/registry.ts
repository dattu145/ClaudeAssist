import type { Task, TaskStatus } from "@claudeops/protocol";
import type { Logger } from "@claudeops/logging";
import type { SessionRegistry } from "../session/registry.js";
import { NoCancellableTaskError, TaskNotFoundError } from "../errors.js";
import { createTask, transitionTask } from "./entity.js";
import { INSTRUCTION_RESULT_TO_TASK_STATUS } from "./outcome.js";
import type { TaskRepository } from "./repository.js";

/**
 * Wraps SessionRegistry.sendInstruction so every dispatched instruction
 * produces a persisted, state-tracked Task — the spec's "what did I tell
 * Project A to do?" requirement. Does not modify SessionRegistry; only
 * wraps it (see .claude/plans/page11.md).
 */
export class TaskRegistry {
  constructor(
    private readonly repository: TaskRepository,
    private readonly sessionRegistry: SessionRegistry,
    private readonly logger: Logger
  ) {}

  async dispatchInstruction(sessionId: string, instruction: string): Promise<Task> {
    // Throws SessionNotFoundError if unknown; also gives us the projectId
    // a Task requires.
    const session = await this.sessionRegistry.getSession(sessionId);

    let task = createTask({ projectId: session.projectId, sessionId, instruction });
    await this.repository.create(task);

    task = await this.applyAndPersist(task, "DISPATCHING");
    task = await this.applyAndPersist(task, "RUNNING");

    try {
      const result = await this.sessionRegistry.sendInstruction(sessionId, instruction);
      task = await this.applyAndPersist(task, INSTRUCTION_RESULT_TO_TASK_STATUS[result.status]);
      return task;
    } catch (err) {
      // A task must never be left stuck in RUNNING because the adapter
      // call itself threw (as opposed to returning a "failed" result).
      await this.applyAndPersist(task, "FAILED");
      throw err;
    }
  }

  async getTask(id: string): Promise<Task> {
    const task = await this.repository.findById(id);
    if (!task) {
      throw new TaskNotFoundError(id);
    }
    return task;
  }

  async listTasksForSession(sessionId: string): Promise<Task[]> {
    return this.repository.listBySession(sessionId);
  }

  async cancelTask(id: string): Promise<Task> {
    const task = await this.getTask(id);
    return this.applyAndPersist(task, "CANCELLED");
  }

  /**
   * Cancels the most recent still-cancellable task for a session (used by
   * POST /sessions/:id/cancel — page12). "Cancellable" is the same set
   * TASK_STATUS_TRANSITIONS allows -> CANCELLED from: QUEUED, DISPATCHING,
   * WAITING. A RUNNING task (a truly in-flight dispatch) is deliberately
   * not considered here — see page11's Risks: cancelling that needs
   * adapter-level cancellation, out of scope.
   */
  async cancelLatestTaskForSession(sessionId: string): Promise<Task> {
    await this.sessionRegistry.getSession(sessionId); // throws SessionNotFoundError if unknown

    const CANCELLABLE_STATUSES: readonly TaskStatus[] = ["QUEUED", "DISPATCHING", "WAITING"];
    const tasks = await this.repository.listBySession(sessionId);
    const cancellable = [...tasks].reverse().find((t) => CANCELLABLE_STATUSES.includes(t.status));

    if (!cancellable) {
      throw new NoCancellableTaskError(sessionId);
    }
    return this.cancelTask(cancellable.id);
  }

  private async applyAndPersist(task: Task, target: Task["status"]): Promise<Task> {
    const next = transitionTask(task, target, this.logger);
    await this.repository.update(next);
    return next;
  }
}
