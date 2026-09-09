import { z } from "zod";

/** See .claude/architecture/event-system.md */
export const DOMAIN_EVENT_TYPES = [
  "SESSION_DISCOVERED",
  "SESSION_STARTED",
  "SESSION_STATUS_CHANGED",
  "SESSION_OUTPUT",
  "SESSION_TASK_STARTED",
  "SESSION_TASK_PROGRESS",
  "SESSION_WAITING_FOR_INPUT",
  "SESSION_WAITING_FOR_PERMISSION",
  "SESSION_COMPLETED",
  "SESSION_FAILED",
  "SESSION_STOPPED",
  "SESSION_DISCONNECTED",
  "SESSION_ERROR",
] as const;

export const DomainEventTypeSchema = z.enum(DOMAIN_EVENT_TYPES);
export type DomainEventType = z.infer<typeof DomainEventTypeSchema>;

export const EVENT_SOURCES = ["controller", "mobile", "voice", "whatsapp", "system"] as const;
export const EventSourceSchema = z.enum(EVENT_SOURCES);
export type EventSource = z.infer<typeof EventSourceSchema>;

export const DomainEventSchema = z.object({
  id: z.string().min(1),
  type: DomainEventTypeSchema,
  timestamp: z.string().datetime(),
  projectId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  payload: z.unknown(),
  source: EventSourceSchema,
});
export type DomainEvent = z.infer<typeof DomainEventSchema>;
