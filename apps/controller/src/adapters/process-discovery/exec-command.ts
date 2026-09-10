import { spawn } from "node:child_process";

export interface ExecResult {
  stdout: string;
  exitCode: number | null;
}

export type ExecCommand = (command: string, args: string[]) => Promise<ExecResult>;

/** No shell needed here — unlike claude.cmd (page8), powershell.exe/ps are
 * real executables, not .cmd shims. */
export const defaultExec: ExecCommand = (command, args) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ stdout, exitCode }));
  });
};
