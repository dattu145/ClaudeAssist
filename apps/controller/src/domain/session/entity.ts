import { generateId, nowIso } from "@claudeops/shared";
import { ClaudeSessionSchema, type ClaudeSession, type SessionStatus } from "@claudeops/protocol";
import type { Logger } from "@claudeops/logging";
import { applyTransition } from "./state-machine.js";

export interface CreateSessionInput {
  projectId: string;
  claudeSessionId?: string | null;
  /** Optional caller-supplied id (page10: SessionRegistry generates this
   * upfront so it can subscribe to adapter events before the adapter's own
   * startSession call fires them). Defaults to a fresh generated id. */
  id?: string;
}

/**
 * Creates a new session in the DISCOVERED state. Validated against
 * ClaudeSessionSchema before returning so a domain bug (e.g. a missing
 * field) is caught here, not once it reaches the registry/DB layers.
 */
export function createSession(input: CreateSessionInput): ClaudeSession {
  const timestamp = nowIso();
  const session: ClaudeSession = {
    id: input.id ?? generateId("session"),
    projectId: input.projectId,
    claudeSessionId: input.claudeSessionId ?? null,
    status: "DISCOVERED",
    currentTask: null,
    processId: null,
    terminalId: null,
    lastOutput: null,
    lastError: null,
    startedAt: timestamp,
    lastActivityAt: timestamp,
  };
  return ClaudeSessionSchema.parse(session);
}

/**
 * Transitions `session` to `target` via the state machine. Immutable:
 * never mutates the input. Returns a new object with `status` and
 * `lastActivityAt` updated only when the transition actually applied;
 * otherwise returns an object equal in every field to the input (the
 * state-machine layer already logged why).
 */
export function transitionSession(
  session: ClaudeSession,
  target: SessionStatus,
  logger: Logger
): ClaudeSession {
  const nextStatus = applyTransition(session.status, target, logger);

  if (nextStatus === session.status) {
    return session;
  }

  const next: ClaudeSession = {
    ...session,
    status: nextStatus,
    lastActivityAt: nowIso(),
  };
  return ClaudeSessionSchema.parse(next);
}
