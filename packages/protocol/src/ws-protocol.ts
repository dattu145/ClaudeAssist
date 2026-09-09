import { z } from "zod";
import type { DomainEventType } from "./event.js";

/**
 * Maps internal DomainEventType (SCREAMING_SNAKE_CASE) to the wire protocol's
 * dot-notation type string, per the example in .claude/ARCHITECTURE.md
 * ("session.status_changed"). Kept as an explicit map (not a generic string
 * transform) so the wire format can diverge deliberately if ever needed.
 */
export const DOMAIN_EVENT_TO_WS_TYPE: Readonly<Record<DomainEventType, string>> = Object.freeze({
  SESSION_DISCOVERED: "session.discovered",
  SESSION_STARTED: "session.started",
  SESSION_STATUS_CHANGED: "session.status_changed",
  SESSION_OUTPUT: "session.output",
  SESSION_TASK_STARTED: "session.task_started",
  SESSION_TASK_PROGRESS: "session.task_progress",
  SESSION_WAITING_FOR_INPUT: "session.waiting_for_input",
  SESSION_WAITING_FOR_PERMISSION: "session.waiting_for_permission",
  SESSION_COMPLETED: "session.completed",
  SESSION_FAILED: "session.failed",
  SESSION_STOPPED: "session.stopped",
  SESSION_DISCONNECTED: "session.disconnected",
  SESSION_ERROR: "session.error",
});

export const WS_EVENT_TYPES = Object.values(DOMAIN_EVENT_TO_WS_TYPE) as [string, ...string[]];
export const WsEventTypeSchema = z.enum(WS_EVENT_TYPES);
export type WsEventType = z.infer<typeof WsEventTypeSchema>;

export const WS_PROTOCOL_VERSION = 1 as const;

export const WsEnvelopeSchema = z.object({
  version: z.literal(WS_PROTOCOL_VERSION),
  type: WsEventTypeSchema,
  timestamp: z.string().datetime(),
  sessionId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  data: z.unknown(),
});
export type WsEnvelope = z.infer<typeof WsEnvelopeSchema>;
