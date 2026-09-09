import { randomUUID } from "node:crypto";

/**
 * Generates a stable-format entity id (e.g. "session_<uuid>"), matching the
 * spec's examples ("project_123"). Used for every domain entity id so
 * ids are recognizable at a glance in logs/events without decoding a bare
 * UUID.
 */
export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
