import { z } from "zod";
import type { DiscoveredClaudeProcess } from "../../domain/session/adapter.js";

/**
 * `claude agents --json --all` output isn't itself a versioned/validated
 * API (see .claude/research/claude-code.md) — validated defensively so a
 * shape drift logs a skip, not a crash.
 */
const AgentRowSchema = z.object({
  pid: z.number(),
  cwd: z.string(),
  kind: z.enum(["interactive", "background"]),
  sessionId: z.string(),
  name: z.string().optional(),
  status: z.enum(["busy", "idle"]).optional(),
  id: z.string().optional(),
});

export interface ParsedAgentsOutput {
  discovered: DiscoveredClaudeProcess[];
  skipped: number;
}

export function parseAgentsJson(stdout: string): ParsedAgentsOutput {
  let rows: unknown;
  try {
    rows = JSON.parse(stdout);
  } catch {
    return { discovered: [], skipped: 0 };
  }
  if (!Array.isArray(rows)) {
    return { discovered: [], skipped: 0 };
  }

  const discovered: DiscoveredClaudeProcess[] = [];
  let skipped = 0;

  for (const row of rows) {
    const parsed = AgentRowSchema.safeParse(row);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    const r = parsed.data;
    discovered.push({
      pid: r.pid,
      cwd: r.cwd,
      kind: r.kind,
      claudeSessionId: r.sessionId,
      name: r.name ?? null,
      status: r.status ?? null,
      backgroundId: r.id ?? null,
    });
  }

  return { discovered, skipped };
}
