# Page 8: ClaudeCodeAdapter (real implementation)

# Objective
Implement `ClaudeCodeAdapter`, the real `ClaudeSessionAdapter` (page7),
against the actual `claude` CLI — grounded in real, verified CLI behavior
captured today (2026-09-09, v2.1.266), not assumption.

# Why — a design correction, found by testing, not guessed
Before writing code, three real CLI probes (with the user's explicit
approval to spend a small amount of Claude usage) overturned the original
research doc's `--bg`-centric design:

1. `--bg` and `-p`/`--print` are **mutually exclusive** (real CLI error).
2. `--session-id` is **ignored** when combined with `--bg`.
3. A session running as a `--bg` job **cannot** be dispatched to via
   `-p --resume` until it's stopped first.

Full corrected findings are in `.claude/research/claude-code.md` (see the
"CORRECTION (page8)" section and the revised "Chosen adapter design"). The
upshot: every ClaudeOps-managed session is a **plain resumable conversation**
(`-p --session-id` then `-p --resume`), never a `--bg` job. `--bg` is
reserved for a possible future "watch a long task live" feature, out of
scope now. This also means `stopSession`/`resumeSession` are mostly local
bookkeeping (kill an in-flight dispatch process; no persistent process
exists between dispatches to stop/resume at the CLI level).

A second correction: page7's `discoverSessions(): Promise<ClaudeSession[]>`
assumed discovery could produce full domain entities, but `claude agents
--json` has no concept of `projectId` (a ClaudeOps invention) — matching a
discovered process to a registered `Project` by `cwd` belongs to the Session
Registry (page9), not the adapter. `domain/session/adapter.ts` gains a new
`DiscoveredClaudeProcess` type and `discoverSessions`'s return type changes
to `DiscoveredClaudeProcess[]`. Safe to amend now (page9, the only future
consumer, doesn't exist yet).

# Prerequisites
Page7 (port + fake adapter) done. Real CLI probed directly (see research doc).

# Implementation
1. `domain/session/adapter.ts` — add `DiscoveredClaudeProcess { pid: number;
   cwd: string; kind: "interactive" | "background"; claudeSessionId: string;
   name: string | null; status: "busy" | "idle" | null; backgroundId: string
   | null }`; change `discoverSessions` return type.
2. `domain/session/outcome.ts` — extract `INSTRUCTION_OUTCOME_TO_STATUS`
   (moved out of the fake adapter, shared by both implementations).
3. `apps/controller/src/adapters/claude-code/cli.ts` — `runClaudeCli(args,
   {cwd}): { result: Promise<{stdout, stderr, exitCode}>; kill: () => void
   }`. Spawns `claude.cmd`/`claude` (platform-selected) directly, **no
   shell** — Node handles `.cmd` argument escaping internally on Windows
   (unlike `exec`/`shell: true`, which would require caller-side escaping of
   arbitrary instruction text — a real injection risk this avoids).
   Injectable (`RunClaudeCli` type) so the adapter is testable without the
   real CLI.
4. `apps/controller/src/adapters/claude-code/stream-json.ts` —
   `parseStreamJsonOutput(stdout): { claudeSessionId, outputText, status,
   error? }`, per the real line shapes documented in the research doc.
   Malformed lines are skipped, not thrown. `WAITING_FOR_INPUT` is never
   produced (documented limitation — a one-shot `-p` process cannot pause
   mid-turn).
5. `apps/controller/src/adapters/claude-code/agents.ts` —
   `parseAgentsJson(stdout): { discovered: DiscoveredClaudeProcess[];
   skipped: number }`, validated defensively against a local Zod schema
   (the real CLI's JSON isn't itself Zod-validated) so a shape drift logs a
   skip, not a crash.
6. `apps/controller/src/adapters/claude-code/claude-code-adapter.ts` —
   `ClaudeCodeAdapter implements ClaudeSessionAdapter`, per the corrected
   design in the research doc. Tracks `projectPath` per session internally
   (needed on every dispatch, but not part of the port's `sendInstruction`
   signature) and an in-flight kill function per session (for `stopSession`
   to actually interrupt a running dispatch).
7. Tests: `stream-json.test.ts` and `agents.test.ts` against real captured
   sample lines (pure functions, no process spawning). `claude-code-
   adapter.test.ts` against an injected fake `RunClaudeCli` double covering
   the full lifecycle, permission-denial -> `WAITING_FOR_PERMISSION`
   mapping, error -> `FAILED` mapping, stop killing an in-flight dispatch,
   and `SessionNotFoundError` cases — all part of the default suite, no real
   CLI involved (TEST_PLAN.md "Adapter (fake)" layer, mirroring page7's
   approach but this time faking the CLI boundary instead of the whole
   adapter).
8. `claude-code-adapter.real.test.ts` — a small **opt-in** suite
   (TEST_PLAN.md "Adapter (real, opt-in)" layer) gated behind
   `process.env.CLAUDEOPS_REAL_CLI_TESTS === "1"` (skipped by default, so
   `npm test` never spends real API usage), exercising one real dispatch
   against a scratch directory to catch drift against the real CLI over
   time.
9. Not wired into `lifecycle.ts`/`server.ts` yet — nothing consumes
   `ClaudeCodeAdapter` until page9 (Session Registry).

# Files Changed
New: `apps/controller/src/domain/session/outcome.ts`,
`apps/controller/src/adapters/claude-code/{cli,stream-json,agents,
claude-code-adapter}.ts` (+ `.test.ts` for each except `cli.ts`, plus the
opt-in real test). Modified: `domain/session/adapter.ts`,
`adapters/fake/fake-claude-session-adapter.ts` (+ its test — `discoverSessions`
return type change), `.claude/research/claude-code.md` (already corrected).

# Tests
Per above; `npm run typecheck`, `npm run lint`, `npm test` green from root
(the opt-in real suite excluded by default).

# Acceptance Criteria
- [ ] `ClaudeCodeAdapter` never uses `--bg`, `shell: true`, or any form of
      terminal screenshotting/keystroke injection.
- [ ] Every dispatch includes `--verbose` alongside `--output-format
      stream-json` (real CLI requirement, verified).
- [ ] `permission_denials` non-empty maps to `WAITING_FOR_PERMISSION`;
      `is_error` maps to `FAILED`; otherwise `COMPLETED`. `WAITING_FOR_INPUT`
      is documented as unreachable through this path, not silently mapped
      to something else.
- [ ] `stopSession` kills an actually in-flight dispatch process (verified
      by test, not just by code review).
- [ ] `discoverSessions` never throws on malformed/unexpected CLI output —
      logs and returns what it could parse.
- [ ] All default-suite tests pass (opt-in real suite excluded); typecheck
      and lint clean.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- The real CLI's JSON shapes (stream-json line types, `agents --json` rows)
  are not a versioned/contractual API — re-verify against `claude --version`
  when it changes, per ADR-003. The opt-in real test suite exists
  specifically to catch this kind of drift early.
- `permission_denials`-based `WAITING_FOR_PERMISSION` detection is a
  reasonable inference from one real sample, not an exhaustively tested
  contract — flagged here for extra scrutiny if page9+ behavior around
  permission handling looks wrong in practice.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page9.md` written (Session Registry) before starting page9
