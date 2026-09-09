import { generateId, nowIso } from "@claudeops/shared";
import { TaskSchema, type Task, type TaskStatus } from "@claudeops/protocol";
import type { Logger } from "@claudeops/logging";
import { applyTransition } from "./state-machine.js";

const TERMINAL_STATUSES: readonly TaskStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];

export interface CreateTaskInput {
  projectId: string;
  sessionId: string;
  instruction: string;
}

export function createTask(input: CreateTaskInput): Task {
  const task: Task = {
    id: generateId("task"),
    projectId: input.projectId,
    sessionId: input.sessionId,
    instruction: input.instruction,
    status: "QUEUED",
    createdAt: nowIso(),
    startedAt: null,
    completedAt: null,
  };
  return TaskSchema.parse(task);
}

/**
 * Transitions `task` to `target`. Immutable, self-validating (same pattern
 * as domain/session/entity.ts's transitionSession). Unlike a session
 * transition, this also sets `startedAt` the first time a task reaches
 * RUNNING and `completedAt` the moment it reaches any terminal status —
 * that bookkeeping lives here, once, rather than duplicated by callers.
 */
export function transitionTask(task: Task, target: TaskStatus, logger: Logger): Task {
  const nextStatus = applyTransition(task.status, target, logger);

  if (nextStatus === task.status) {
    return task;
  }

  const now = nowIso();
  const next: Task = {
    ...task,
    status: nextStatus,
    startedAt: nextStatus === "RUNNING" && task.startedAt === null ? now : task.startedAt,
    completedAt: TERMINAL_STATUSES.includes(nextStatus) ? now : task.completedAt,
  };
  return TaskSchema.parse(next);
}
