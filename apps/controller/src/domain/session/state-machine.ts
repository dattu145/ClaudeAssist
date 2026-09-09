import { isValidSessionTransition, type SessionStatus } from "@claudeops/protocol";
import type { Logger } from "@claudeops/logging";

/**
 * The only code path allowed to decide whether a session status transition
 * is valid (see .claude/architecture/session-model.md — "Invalid state
 * transitions must be rejected and logged"). Pure: never throws, never
 * mutates. An invalid transition is a logged no-op, not an exception — the
 * caller decides whether that no-op itself constitutes an error.
 */
export function applyTransition(
  current: SessionStatus,
  target: SessionStatus,
  logger: Logger
): SessionStatus {
  if (current === target) {
    return current;
  }

  if (!isValidSessionTransition(current, target)) {
    logger.warn("rejected invalid session transition", {
      event: "invalid_session_transition",
      from: current,
      to: target,
    });
    return current;
  }

  return target;
}
