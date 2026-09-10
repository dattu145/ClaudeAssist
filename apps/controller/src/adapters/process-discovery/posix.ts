import type { ProcessDiscoveryService, ProcessInfo } from "../../domain/process-discovery/service.js";
import { isClaudeProcess } from "../../domain/process-discovery/service.js";
import { defaultExec, type ExecCommand } from "./exec-command.js";

// pid and ppid are numeric, comm can't contain whitespace — the remainder
// of the line (args, the full command line) can, so it's captured greedily
// as everything after the first three fields.
const PS_LINE_PATTERN = /^\s*(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/;

/**
 * Parses `ps -eo pid=,ppid=,comm=,args=` output (no header line, `=`
 * suppresses it). NOT verified against a real POSIX machine — this dev
 * environment is Windows (see .claude/plans/page15.md). Documented as an
 * honest limitation, not claimed as tested.
 */
export function parsePosixProcessListing(stdout: string): ProcessInfo[] {
  const processes: ProcessInfo[] = [];

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) {
      continue;
    }
    const match = PS_LINE_PATTERN.exec(line);
    if (!match) {
      continue;
    }
    const [, pidStr, ppidStr, comm, args] = match;
    processes.push({
      pid: Number(pidStr),
      name: comm ?? "",
      commandLine: args && args.length > 0 ? args : null,
      parentPid: Number(ppidStr),
    });
  }

  return processes;
}

export class PosixProcessDiscoveryService implements ProcessDiscoveryService {
  constructor(private readonly exec: ExecCommand = defaultExec) {}

  async listProcesses(): Promise<ProcessInfo[]> {
    const { stdout, exitCode } = await this.exec("ps", ["-eo", "pid=,ppid=,comm=,args="]);
    if (exitCode !== 0) {
      return [];
    }
    return parsePosixProcessListing(stdout);
  }

  async findClaudeProcesses(): Promise<ProcessInfo[]> {
    return (await this.listProcesses()).filter(isClaudeProcess);
  }
}
