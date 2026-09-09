import { z } from "zod";

/**
 * Formal session state machine (see .claude/architecture/session-model.md).
 * This is the single source of truth for valid states and transitions —
 * domain code (page5) and tests import SESSION_STATUS_TRANSITIONS rather than
 * redefining it.
 */
export const SESSION_STATUSES = [
  "DISCOVERED",
  "STARTING",
  "IDLE",
  "WORKING",
  "WAITING_FOR_INPUT",
  "WAITING_FOR_PERMISSION",
  "COMPLETED",
  "FAILED",
  "STOPPED",
  "DISCONNECTED",
  "UNKNOWN",
] as const;

export const SessionStatusSchema = z.enum(SESSION_STATUSES);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/**
 * Allowed transitions per architecture/session-model.md. A transition not
 * listed here must be rejected and logged, not applied.
 */
export const SESSION_STATUS_TRANSITIONS: Readonly<Record<SessionStatus, readonly SessionStatus[]>> =
  Object.freeze({
    DISCOVERED: ["STARTING", "UNKNOWN", "DISCONNECTED"],
    STARTING: ["IDLE", "WORKING", "FAILED", "DISCONNECTED"],
    IDLE: ["WORKING", "STOPPED", "DISCONNECTED", "UNKNOWN"],
    WORKING: [
      "WAITING_FOR_INPUT",
      "WAITING_FOR_PERMISSION",
      "COMPLETED",
      "FAILED",
      "STOPPED",
      "DISCONNECTED",
    ],
    WAITING_FOR_INPUT: ["WORKING", "STOPPED", "DISCONNECTED"],
    WAITING_FOR_PERMISSION: ["WORKING", "STOPPED", "DISCONNECTED"],
    COMPLETED: ["WORKING", "DISCONNECTED"],
    FAILED: ["STARTING", "DISCONNECTED"],
    STOPPED: ["STARTING", "DISCONNECTED"],
    DISCONNECTED: ["UNKNOWN", "STARTING"],
    UNKNOWN: [...SESSION_STATUSES],
  });

export function isValidSessionTransition(from: SessionStatus, to: SessionStatus): boolean {
  return SESSION_STATUS_TRANSITIONS[from].includes(to);
}

export const ClaudeSessionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  claudeSessionId: z.string().min(1).nullable(),
  status: SessionStatusSchema,
  currentTask: z.string().nullable(),
  processId: z.number().int().positive().nullable(),
  terminalId: z.string().nullable(),
  lastOutput: z.string().nullable(),
  lastError: z.string().nullable(),
  startedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
});
export type ClaudeSession = z.infer<typeof ClaudeSessionSchema>;
