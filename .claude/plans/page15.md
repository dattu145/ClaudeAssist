# Page 15: ProcessDiscoveryService

# Objective
The spec's platform abstraction for OS-level process listing —
`listProcesses()`/`findClaudeProcesses()` — implemented for Windows (this
machine's primary dev environment) with a POSIX implementation built for
portability but not exercisable/verified here (this machine is Windows).
Not wired into `lifecycle.ts` yet — page16 (startup reconciliation) is
where it (or `ClaudeCodeAdapter.discoverSessions`) actually gets consumed;
this page builds and tests the service on its own, matching how earlier
building-block pages (e.g. page7's fake adapter) landed before their
consumer did.

# Why
Distinct from `ClaudeCodeAdapter.discoverSessions()` (page8, backed by
`claude agents --json` — Claude Code's own self-reported session list).
`ProcessDiscoveryService` is a level below that: plain OS process
enumeration, independent of whether Claude Code itself is working or
reporting correctly. Per architecture/session-model.md's hierarchy
(`Project -> Terminal -> Process -> ClaudeSession`), this is the `Process`
layer — a cross-check/fallback signal, not a replacement for
`claude agents --json`.

# Design
- `ProcessInfo { pid, name, commandLine: string | null, parentPid: number |
  null }`.
- `ProcessDiscoveryService { listProcesses(): Promise<ProcessInfo[]>;
  findClaudeProcesses(): Promise<ProcessInfo[]> }`.
- `findClaudeProcesses` is `listProcesses().filter(isClaudeProcess)` in
  every implementation — the matching rule (`/^claude(\.exe|\.cmd)?$/i` on
  the process name) lives once, shared.
- **Windows**: `powershell.exe -NoProfile -NonInteractive -Command
  "Get-CimInstance Win32_Process | Select-Object ProcessId,Name,
  CommandLine,ParentProcessId | ConvertTo-Json -Compress"`. `powershell.exe`
  is a real executable (unlike `claude.cmd`, page8's shell/.cmd problem
  doesn't apply here) — spawned directly, no shell. Output validated
  defensively (a local Zod schema, same pattern as page8's `agents.ts`) so
  a shape drift logs/skips rather than crashing; `ConvertTo-Json` returns a
  bare object instead of a one-element array when there's exactly one
  process, normalized explicitly.
- **POSIX**: `ps -eo pid=,ppid=,comm=,args=`, parsed with a regex
  (`pid`/`ppid`/`comm` are whitespace-delimited and can't contain spaces;
  the remainder of the line is the full command line, which can). Built
  for portability per the spec's explicit instruction, but **not verified
  on a real POSIX machine** — this dev environment is Windows. Documented
  as an honest limitation, not silently claimed as tested.
- Both implementations accept an injectable command-runner
  (`ExecCommand`), so parsing logic is unit-testable with canned output —
  spawning a real `ps`/PowerShell process in every test run would be slow
  and, for POSIX, impossible to verify from Windows anyway.
- `createProcessDiscoveryService()` factory picks the implementation by
  `process.platform`.

# Implementation
1. `domain/process-discovery/service.ts` — `ProcessInfo`,
   `ProcessDiscoveryService`, `isClaudeProcess`.
2. `adapters/process-discovery/windows.ts` —
   `WindowsProcessDiscoveryService` + `parseWindowsProcessListing`.
3. `adapters/process-discovery/posix.ts` — `PosixProcessDiscoveryService` +
   `parsePosixProcessListing`.
4. `adapters/process-discovery/create-process-discovery-service.ts` — the
   platform-picking factory.

# Files Changed
New: `domain/process-discovery/service.ts` (+ test),
`adapters/process-discovery/{windows,posix,create-process-discovery-
service}.ts` (+ tests).

# Tests
Parsing tests for both platforms against captured/representative JSON
(Windows) and `ps`-formatted (POSIX) output, including the Windows
single-process (bare object, not array) case and malformed/partial rows
being skipped rather than crashing. `findClaudeProcesses` filtering
(matches `claude.exe`/`claude.cmd`/`claude`, not `claude-something-else` or
unrelated processes). A real, opt-in-only manual check against this
Windows machine's actual process list (not part of the automated suite —
consistent with page8's real-CLI test being separately gated) to confirm
the PowerShell invocation genuinely works, not just that parsing does.

# Acceptance Criteria
- [ ] No Windows/POSIX-specific command string appears outside
      `adapters/process-discovery/` — verified by grep.
- [ ] `findClaudeProcesses` correctly filters real claude executable names
      without false-positiving on similarly-named processes.
- [ ] Malformed/partial process rows are skipped, never crash discovery.
- [ ] The POSIX implementation's untested status on this machine is
      documented, not silently implied to be verified.
- [ ] All automated tests pass; typecheck and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- POSIX parsing is genuinely unverified — flagged here and in RISKS.md;
  whoever first runs the controller on macOS/Linux should treat this as a
  known "verify before trusting" item, not an assumed-working feature.
- `Get-CimInstance Win32_Process` can be slow on a machine with very many
  processes — acceptable for Phase 1's periodic/on-demand use, not
  optimized further without a demonstrated need.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page16.md` written (startup reconciliation) before
      starting page16
