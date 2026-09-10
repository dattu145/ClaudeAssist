import { z } from "zod";
import type { ProcessDiscoveryService, ProcessInfo } from "../../domain/process-discovery/service.js";
import { isClaudeProcess } from "../../domain/process-discovery/service.js";
import { defaultExec, type ExecCommand } from "./exec-command.js";

const PS_COMMAND =
  "Get-CimInstance Win32_Process | " +
  "Select-Object ProcessId,Name,CommandLine,ParentProcessId | " +
  "ConvertTo-Json -Compress";

const WindowsProcessRowSchema = z.object({
  ProcessId: z.number(),
  Name: z.string(),
  CommandLine: z.string().nullable().optional(),
  ParentProcessId: z.number().nullable().optional(),
});

/**
 * Parses `ConvertTo-Json`'s output. PowerShell returns a bare object
 * (not a one-element array) when there's exactly one row — normalized
 * here. Malformed/partial rows are skipped, not thrown.
 */
export function parseWindowsProcessListing(stdout: string): ProcessInfo[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const processes: ProcessInfo[] = [];

  for (const row of rows) {
    const result = WindowsProcessRowSchema.safeParse(row);
    if (!result.success) {
      continue;
    }
    processes.push({
      pid: result.data.ProcessId,
      name: result.data.Name,
      commandLine: result.data.CommandLine ?? null,
      parentPid: result.data.ParentProcessId ?? null,
    });
  }

  return processes;
}

export class WindowsProcessDiscoveryService implements ProcessDiscoveryService {
  constructor(private readonly exec: ExecCommand = defaultExec) {}

  async listProcesses(): Promise<ProcessInfo[]> {
    const { stdout, exitCode } = await this.exec("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      PS_COMMAND,
    ]);
    if (exitCode !== 0) {
      return [];
    }
    return parseWindowsProcessListing(stdout);
  }

  async findClaudeProcesses(): Promise<ProcessInfo[]> {
    return (await this.listProcesses()).filter(isClaudeProcess);
  }
}
