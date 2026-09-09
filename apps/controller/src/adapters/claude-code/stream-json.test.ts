import { describe, expect, it } from "vitest";
import { parseStreamJsonOutput } from "./stream-json.js";

const SESSION_ID = "0de8110c-5079-4cd8-8244-e2493dfc2b5e";

function initLine(sessionId = SESSION_ID) {
  return JSON.stringify({ type: "system", subtype: "init", session_id: sessionId, cwd: "/x" });
}

function assistantLine(text: string, sessionId = SESSION_ID) {
  return JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "text", text }] },
    session_id: sessionId,
  });
}

function resultLine(overrides: Record<string, unknown> = {}, sessionId = SESSION_ID) {
  return JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result: "OK",
    session_id: sessionId,
    permission_denials: [],
    ...overrides,
  });
}

describe("parseStreamJsonOutput", () => {
  it("parses a successful real-shaped transcript (captured 2026-09-09, v2.1.266)", () => {
    const stdout = [initLine(), assistantLine("OK"), resultLine()].join("\n");

    const parsed = parseStreamJsonOutput(stdout);

    expect(parsed.status).toBe("completed");
    expect(parsed.outputText).toBe("OK");
    expect(parsed.claudeSessionId).toBe(SESSION_ID);
    expect(parsed.error).toBeUndefined();
  });

  it("maps is_error: true to failed", () => {
    const stdout = [initLine(), resultLine({ is_error: true, result: "something broke" })].join(
      "\n"
    );

    const parsed = parseStreamJsonOutput(stdout);

    expect(parsed.status).toBe("failed");
    expect(parsed.error).toBe("something broke");
  });

  it("maps a non-empty permission_denials to waiting_for_permission, even when is_error is false", () => {
    const stdout = [
      initLine(),
      resultLine({ permission_denials: [{ tool: "Bash", reason: "denied" }] }),
    ].join("\n");

    const parsed = parseStreamJsonOutput(stdout);

    expect(parsed.status).toBe("waiting_for_permission");
  });

  it("skips malformed lines instead of throwing", () => {
    const stdout = [initLine(), "not json at all", "{broken", resultLine()].join("\n");

    expect(() => parseStreamJsonOutput(stdout)).not.toThrow();
    expect(parseStreamJsonOutput(stdout).status).toBe("completed");
  });

  it("falls back to accumulated assistant text when there is no result line", () => {
    const stdout = [initLine(), assistantLine("partial output")].join("\n");

    const parsed = parseStreamJsonOutput(stdout);

    expect(parsed.status).toBe("failed");
    expect(parsed.outputText).toBe("partial output");
    expect(parsed.error).toBeDefined();
  });

  it("concatenates multiple assistant text blocks across lines", () => {
    const stdout = [initLine(), assistantLine("first"), assistantLine("second")].join("\n");

    const parsed = parseStreamJsonOutput(stdout);
    // no result line -> falls back to assistant text
    expect(parsed.outputText).toBe("first\nsecond");
  });

  it("ignores non-text content blocks and unrelated line types", () => {
    const stdout = [
      initLine(),
      JSON.stringify({ type: "rate_limit_event", rate_limit_info: {} }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Bash" }] },
      }),
      resultLine(),
    ].join("\n");

    expect(() => parseStreamJsonOutput(stdout)).not.toThrow();
    expect(parseStreamJsonOutput(stdout).status).toBe("completed");
  });
});
