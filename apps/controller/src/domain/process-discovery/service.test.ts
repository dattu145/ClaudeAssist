import { describe, expect, it } from "vitest";
import { isClaudeProcess, type ProcessInfo } from "./service.js";

function proc(name: string): ProcessInfo {
  return { pid: 1, name, commandLine: null, parentPid: null };
}

describe("isClaudeProcess", () => {
  it("matches the bare and platform-suffixed claude executable names", () => {
    expect(isClaudeProcess(proc("claude"))).toBe(true);
    expect(isClaudeProcess(proc("claude.exe"))).toBe(true);
    expect(isClaudeProcess(proc("claude.cmd"))).toBe(true);
    expect(isClaudeProcess(proc("CLAUDE.EXE"))).toBe(true);
  });

  it("does not match similarly-named or unrelated processes", () => {
    expect(isClaudeProcess(proc("claude-desktop"))).toBe(false);
    expect(isClaudeProcess(proc("claudeops"))).toBe(false);
    expect(isClaudeProcess(proc("node"))).toBe(false);
    expect(isClaudeProcess(proc("notclaude.exe"))).toBe(false);
  });
});
