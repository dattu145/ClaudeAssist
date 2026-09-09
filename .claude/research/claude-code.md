# Research: Claude Code CLI/SDK Integration

Environment checked on this machine (2026-09-09, Windows 11, `claude --version` = 2.1.266).
This is the authoritative source for how ClaudeOps's `ClaudeCodeAdapter` talks to Claude Code.
Re-verify against `claude --help` when the installed version changes — flags evolve.

## Mechanisms available (no screen scraping needed)

### 1. Background sessions — the core primitive for "managed" sessions
- `claude --bg` / `--background [--name <n>] [--session-id <uuid>]` starts a session and
  returns immediately, printing a short id.
- `claude agents --json [--all] [--cwd <path>]` lists active (and, with `--all`, completed)
  background **and interactive** sessions as a JSON array. No TTY required — this is the
  primary **discovery** mechanism (`ClaudeSessionAdapter.discoverSessions()`).
- `claude attach <id>` opens a background session's terminal (interactive; not for the
  controller to call programmatically, but useful for a "open in terminal" mobile action
  that shells out on the controller host).
- `claude logs <id>` prints a background session's recent terminal output — a fallback
  output source when structured stream-json wasn't captured live.
- `claude stop|kill <id>` stops a session; conversation is preserved (`STOPPED` state,
  resumable).
- `claude rm <id>` deletes a background session's record (and worktree, when safe).
- `claude respawn [id|--all]` restarts a background session on the current CC version —
  relevant to controller-triggered recovery after a CC upgrade.

### 2. Non-interactive dispatch — the core primitive for "send instruction"
- `-p/--print` runs one turn and exits (or streams, see below). Skips the trust dialog.
- `--output-format stream-json` (with `--print`) streams structured JSON events in real
  time — this is what backs `SESSION_OUTPUT`, `SESSION_TASK_PROGRESS`, tool-use, and
  completion events without parsing terminal text. `--output-format json` gives a single
  final JSON result (good for short fire-and-forget instructions).
- `--include-partial-messages` streams partial message chunks (finer-grained progress).
- `--json-schema <schema>` constrains structured output — useful later for reliably
  detecting "waiting for input" vs "completed" vs "error" from a single turn's result.
- `--input-format stream-json` + `--replay-user-messages` allow feeding instructions in as
  a stream rather than a single arg — relevant for a future "keep a print-mode process
  alive and pipe instructions to it" pattern, though the simpler v1 approach is one
  `-p` invocation per instruction against a resumable session id.

### 3. Session identity and resumption
- `--session-id <uuid>` sets a specific session id at start — the controller should always
  set this explicitly (never rely on Claude Code's auto-generated id) so
  `ClaudeSession.claudeSessionId` is known before the process starts.
- `-r/--resume [session-id]` resumes a conversation by id.
- `-c/--continue` resumes the most recent conversation in the current directory (fragile —
  depends on cwd; prefer `--resume <id>` once an id is known).
- `--fork-session` forks into a new session id on resume — useful for a future "branch this
  task" feature, out of scope for Phase 1.
- `--no-session-persistence` (print mode only) explicitly opts OUT of resumability — the
  adapter must never pass this for managed sessions.

### 4. Permissions (maps directly to the spec's READ/EXECUTE/WRITE/DESTRUCTIVE requirement)
- `--permission-mode <acceptEdits|auto|bypassPermissions|manual|dontAsk|plan>` — Phase 1
  default MUST NOT be `bypassPermissions`. Default to `plan` or `manual`/`auto` depending on
  operation risk class (see SECURITY.md).
- `--permission-prompts <host|none>` — controls who answers a prompt in print mode. `none`
  auto-denies anything requiring approval; useful as a safe default for fully unattended
  dispatch, with `host` reserved for sessions where a human is actively watching via mobile.
- `--allowedTools` / `--disallowedTools` — per-session tool allowlist, another lever for
  the DESTRUCTIVE-operation gating the spec requires.
- `--restricted` — strips Bash/PowerShell/code-exec tools and WebFetch entirely; a strong
  default for sessions dispatched from voice/mobile with no human watching the terminal.
- `--dangerously-skip-permissions` — explicitly forbidden as a default per the spec; the
  adapter interface should not expose a code path that sets this without an explicit,
  logged, user-initiated override.

### 5. Scripting/config surface useful to the controller
- `--settings <file-or-json>`, `--mcp-config`, `--add-dir`, `--model`, `--effort`,
  `-n/--name` — all settable per dispatched session; the controller can pass these through
  from `StartSessionInput` without needing its own equivalents.
- `claude doctor` — health/diagnostic check of the CC installation itself; wire into the
  controller's own `/health` endpoint as one input signal.

## Platform note: invoking the CLI from Node on Windows

On Windows, the npm-installed `claude` command is a `claude.cmd` shim (in
addition to a real `claude` binary launcher). `child_process.execFile("claude",
...)` without a shell fails with `ENOENT` — `execFile` only resolves real
executables, not `.cmd` wrappers. Use `child_process.exec("claude ...")` (which
runs through a shell) instead, as done in `apps/controller/src/health.ts`'s
`defaultCheckClaudeCli`. Verified against the installed CLI (v2.1.266) on this
machine (2026-09-09).

## What this rules out

- No need for terminal screenshotting, keystroke injection, or Playwright-driven terminal
  automation for **managed** sessions (started by ClaudeOps). `--bg` + `-p --output-format
  stream-json` + `claude agents --json` covers start, dispatch, discover, and monitor.
- **Attaching to a pre-existing *interactive* session the user started manually outside
  ClaudeOps** (e.g. a `claude` REPL running in a terminal the user opened themselves) has no
  supported programmatic attach point beyond `claude attach <id>` (itself interactive, and
  only for sessions `--bg` created) and `claude agents --json` (read-only status/discovery,
  works for both interactive and background sessions per `claude agents --help`). There is
  no documented mechanism to inject an instruction into an already-running interactive REPL
  session from outside. **Limitation, not a workaround target**: Phase 1 supports (a) full
  lifecycle control of sessions ClaudeOps starts via `--bg`, and (b) read-only discovery/
  status of any session `claude agents --json` reports, including ones the user started by
  hand. Sending instructions to a manually-started interactive session is out of scope until
  Claude Code exposes a supported IPC/attach mechanism for that case — do not build a
  terminal-automation workaround for it.

## Chosen adapter design (`ClaudeCodeAdapter`)

- **Start**: `claude --bg --session-id <uuid> --name <name> -p "<initial instruction>"
  --output-format stream-json --permission-mode <mode> [--restricted] --cwd`-equivalent via
  spawning with `cwd` set to the project path.
- **Dispatch instruction to existing session**: `claude -p "<instruction>" --resume
  <claudeSessionId> --output-format stream-json` spawned as a short-lived child process;
  stdout parsed line-by-line as stream-json events and translated into ClaudeOps domain
  events.
- **Discover**: poll `claude agents --json --all` on a configurable interval (spec forbids
  uncontrolled polling loops; this one is bounded and interval-configurable) plus an
  on-demand call during controller startup reconciliation.
- **Status**: derived from the last stream-json event type + `claude agents --json` process
  state, not from parsing prose.
- **Stop/Resume**: `claude stop <id>` / `claude --resume <id>` shelled out directly.

This design fulfills the spec's "DO NOT build the core system around fragile screen
scraping" requirement using only documented CLI flags.
