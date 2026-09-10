/**
 * The spec's platform abstraction for OS-level process listing. Distinct
 * from ClaudeSessionAdapter.discoverSessions() (page8, backed by
 * `claude agents --json` — Claude Code's own self-reported session list):
 * this is one layer below, plain OS process enumeration, independent of
 * whether Claude Code itself is working or reporting correctly. Per
 * architecture/session-model.md's hierarchy (Project -> Terminal ->
 * Process -> ClaudeSession), this is the Process layer.
 */
export interface ProcessInfo {
  pid: number;
  name: string;
  commandLine: string | null;
  parentPid: number | null;
}

export interface ProcessDiscoveryService {
  listProcesses(): Promise<ProcessInfo[]>;
  findClaudeProcesses(): Promise<ProcessInfo[]>;
}

const CLAUDE_PROCESS_NAME_PATTERN = /^claude(\.exe|\.cmd)?$/i;

/** Shared by every platform implementation so the matching rule lives
 * once, not duplicated per-OS. */
export function isClaudeProcess(process: ProcessInfo): boolean {
  return CLAUDE_PROCESS_NAME_PATTERN.test(process.name);
}
