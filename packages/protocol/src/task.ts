import { z } from "zod";

export const TASK_STATUSES = [
  "QUEUED",
  "DISPATCHING",
  "RUNNING",
  "WAITING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * See .claude/plans/page11.md. RUNNING -> CANCELLED is deliberately
 * omitted: dispatch is one synchronous await chain, so there's no way to
 * safely interrupt a truly in-flight dispatch at the task layer — that's
 * session-level stopSession's job, not a task-state flip.
 */
export const TASK_STATUS_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> =
  Object.freeze({
    QUEUED: ["DISPATCHING", "CANCELLED"],
    DISPATCHING: ["RUNNING", "FAILED", "CANCELLED"],
    RUNNING: ["WAITING", "COMPLETED", "FAILED"],
    WAITING: ["RUNNING", "COMPLETED", "FAILED", "CANCELLED"],
    COMPLETED: [],
    FAILED: [],
    CANCELLED: [],
  });

export function isValidTaskTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_STATUS_TRANSITIONS[from].includes(to);
}

export const TaskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  instruction: z.string().min(1),
  status: TaskStatusSchema,
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type Task = z.infer<typeof TaskSchema>;
