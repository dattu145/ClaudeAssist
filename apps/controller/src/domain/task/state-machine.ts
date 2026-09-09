import { isValidTaskTransition, type TaskStatus } from "@claudeops/protocol";
import type { Logger } from "@claudeops/logging";

/**
 * The only code path allowed to decide whether a task status transition is
 * valid — identical shape to domain/session/state-machine.ts. Pure: never
 * throws, never mutates. An invalid transition is a logged no-op.
 */
export function applyTransition(current: TaskStatus, target: TaskStatus, logger: Logger): TaskStatus {
  if (current === target) {
    return current;
  }

  if (!isValidTaskTransition(current, target)) {
    logger.warn("rejected invalid task transition", {
      event: "invalid_task_transition",
      from: current,
      to: target,
    });
    return current;
  }

  return target;
}
