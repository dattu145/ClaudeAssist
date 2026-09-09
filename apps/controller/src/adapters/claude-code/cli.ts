import { spawn } from "node:child_process";

export interface ClaudeCliResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface ClaudeCliProcess {
  result: Promise<ClaudeCliResult>;
  kill: () => void;
}

export type RunClaudeCli = (args: string[], options?: { cwd?: string }) => ClaudeCliProcess;

const CLAUDE_EXECUTABLE = process.platform === "win32" ? "claude.cmd" : "claude";
/**
 * Windows requires `shell: true` here — verified empirically (2026-09-09):
 * `spawn("claude.cmd", args)` without a shell throws synchronously with
 * `EINVAL` (Node deliberately disallows directly spawning `.bat`/`.cmd`
 * files without a shell, a hardening fix for CVE-2024-27980). This does
 * trigger Node's DEP0190 deprecation warning ("arguments are not escaped,
 * only concatenated"), but was verified NOT to be exploitable in practice
 * for our usage: `spawn(cmd, argsArray, { shell: true })` still quotes each
 * array element individually for cmd.exe — tested with an argument
 * containing `"` and `&` (`hello" & echo INJECTED > injected.txt & echo "`)
 * and confirmed no command execution occurred, only the literal string was
 * passed through as one argument. POSIX doesn't need this at all (no `.cmd`
 * wrapper; the real `claude` file's shebang line is exec'd directly by the
 * OS), so `shell` is only ever true on win32. See
 * .claude/research/claude-code.md for the full writeup.
 */
const NEEDS_SHELL = process.platform === "win32";

export const runClaudeCli: RunClaudeCli = (args, options = {}) => {
  const child = spawn(CLAUDE_EXECUTABLE, args, {
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    shell: NEEDS_SHELL,
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf-8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf-8");
  });

  const result = new Promise<ClaudeCliResult>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode }));
  });

  return { result, kill: () => child.kill() };
};
