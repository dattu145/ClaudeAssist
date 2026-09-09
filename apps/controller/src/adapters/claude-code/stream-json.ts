import type { InstructionResult } from "../../domain/session/adapter.js";

export interface ParsedDispatchOutcome {
  claudeSessionId: string | null;
  outputText: string;
  status: InstructionResult["status"];
  error?: string;
}

interface StreamJsonLine {
  type?: unknown;
  subtype?: unknown;
  session_id?: unknown;
  message?: { content?: unknown };
  result?: unknown;
  is_error?: unknown;
  permission_denials?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parses `claude -p ... --output-format stream-json --verbose` stdout into
 * a single outcome. Line shapes verified against the real CLI (v2.1.266,
 * 2026-09-09) — see .claude/research/claude-code.md. Malformed lines are
 * skipped, never thrown.
 *
 * WAITING_FOR_INPUT is never produced: a one-shot `-p` process either
 * finishes or errors, it cannot pause mid-turn to ask a free-text question
 * the way an interactive REPL can (documented Phase 1 limitation).
 */
export function parseStreamJsonOutput(stdout: string): ParsedDispatchOutcome {
  let claudeSessionId: string | null = null;
  const assistantTextParts: string[] = [];
  let resultLine: StreamJsonLine | null = null;

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) {
      continue;
    }
    const obj = parsed as StreamJsonLine;

    if (obj.type === "system" && obj.subtype === "init" && typeof obj.session_id === "string") {
      claudeSessionId = obj.session_id;
    } else if (obj.type === "assistant" && isRecord(obj.message) && Array.isArray(obj.message.content)) {
      for (const block of obj.message.content) {
        if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
          assistantTextParts.push(block.text);
        }
      }
    } else if (obj.type === "result") {
      resultLine = obj;
    }
  }

  const assistantText = assistantTextParts.join("\n");

  if (!resultLine) {
    return {
      claudeSessionId,
      outputText: assistantText,
      status: "failed",
      error: "claude exited without a result line",
    };
  }

  const permissionDenials = Array.isArray(resultLine.permission_denials)
    ? resultLine.permission_denials
    : [];
  const outputText = typeof resultLine.result === "string" ? resultLine.result : assistantText;

  const status: InstructionResult["status"] =
    permissionDenials.length > 0 ? "waiting_for_permission" : resultLine.is_error ? "failed" : "completed";

  const finalSessionId = typeof resultLine.session_id === "string" ? resultLine.session_id : claudeSessionId;

  return {
    claudeSessionId: finalSessionId,
    outputText,
    status,
    ...(status === "failed" ? { error: outputText || "claude reported an error" } : {}),
  };
}
