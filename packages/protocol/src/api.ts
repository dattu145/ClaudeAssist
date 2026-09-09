import { z } from "zod";

/**
 * Request body schemas for the REST command surface in
 * .claude/ARCHITECTURE.md. Path params (e.g. :id) are validated separately
 * where routes are defined (page12) since they're routing concerns, not body
 * shape. Response shapes reuse the entity schemas from project.ts/session.ts/
 * task.ts/event.ts directly rather than being redefined here.
 */

export const CreateProjectRequestSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const StartSessionRequestSchema = z.object({
  projectId: z.string().min(1),
  initialInstruction: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});
export type StartSessionRequest = z.infer<typeof StartSessionRequestSchema>;

export const SendInstructionRequestSchema = z.object({
  instruction: z.string().min(1),
});
export type SendInstructionRequest = z.infer<typeof SendInstructionRequestSchema>;

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  uptimeSeconds: z.number().nonnegative(),
  dbReachable: z.boolean(),
  claudeCliReachable: z.boolean(),
  lastReconciliationAt: z.string().datetime().nullable(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
