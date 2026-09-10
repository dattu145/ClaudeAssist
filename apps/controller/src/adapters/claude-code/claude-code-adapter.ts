import { randomUUID } from "node:crypto";
import { nowIso } from "@claudeops/shared";
import type { ClaudeSession, SessionStatus } from "@claudeops/protocol";
import type { Logger } from "@claudeops/logging";
import { createSession, transitionSession } from "../../domain/session/entity.js";
import { SessionNotFoundError } from "../../domain/errors.js";
import { INSTRUCTION_OUTCOME_TO_STATUS } from "../../domain/session/outcome.js";
import type {
  ClaudeSessionAdapter,
  DiscoveredClaudeProcess,
  InstructionResult,
  SessionAdapterEvent,
  SessionAdapterEventType,
  SessionEventHandler,
  StartSessionInput,
  Unsubscribe,
} from "../../domain/session/adapter.js";
import { runClaudeCli, type RunClaudeCli } from "./cli.js";
import { parseStreamJsonOutput } from "./stream-json.js";
import { parseAgentsJson } from "./agents.js";

export interface ClaudeCodeAdapterOptions {
  permissionMode?: string;
  restricted?: boolean;
}

/**
 * Real ClaudeSessionAdapter, per the corrected design in
 * .claude/research/claude-code.md: every managed session is a plain
 * resumable conversation (`-p --session-id` then `-p --resume`), never a
 * `--bg` job. There is no persistent OS process between dispatches, only a
 * short-lived one while a dispatch is actively running. Process spawning
 * (including the Windows `.cmd`/shell nuance) lives entirely in `cli.ts`.
 */
export class ClaudeCodeAdapter implements ClaudeSessionAdapter {
  private readonly sessions = new Map<string, ClaudeSession>();
  private readonly projectPaths = new Map<string, string>();
  private readonly listeners = new Map<string, Set<SessionEventHandler>>();
  private readonly inFlightKill = new Map<string, () => void>();

  constructor(
    private readonly logger: Logger,
    private readonly runCli: RunClaudeCli = runClaudeCli,
    private readonly options: ClaudeCodeAdapterOptions = {}
  ) {}

  async discoverSessions(): Promise<DiscoveredClaudeProcess[]> {
    const { result } = this.runCli(["agents", "--json", "--all"]);
    const { stdout, stderr, exitCode } = await result;

    if (exitCode !== 0) {
      this.logger.warn("claude agents --json failed", { exitCode, stderr });
      return [];
    }

    const { discovered, skipped } = parseAgentsJson(stdout);
    if (skipped > 0) {
      this.logger.warn("skipped unrecognized claude agents rows", { skipped });
    }
    return discovered;
  }

  async startSession(input: StartSessionInput): Promise<ClaudeSession> {
    let session = createSession({
      projectId: input.projectId,
      ...(input.sessionId !== undefined ? { id: input.sessionId } : {}),
    });
    this.sessions.set(session.id, session);
    this.projectPaths.set(session.id, input.projectPath);
    session = this.applyAndEmit(session, "STARTING");

    if (input.initialInstruction) {
      const withTask: ClaudeSession = { ...session, currentTask: input.initialInstruction };
      this.sessions.set(withTask.id, withTask);
      session = this.applyAndEmit(withTask, "WORKING");
      await this.dispatch(session, input.initialInstruction);
      session = this.requireSession(session.id);
    } else {
      session = this.applyAndEmit(session, "IDLE");
    }

    return session;
  }

  async sendInstruction(sessionId: string, instruction: string): Promise<InstructionResult> {
    const withTask: ClaudeSession = { ...this.requireSession(sessionId), currentTask: instruction };
    this.sessions.set(withTask.id, withTask);
    const working = this.applyAndEmit(withTask, "WORKING");
    return this.dispatch(working, instruction);
  }

  async resumeSession(sessionId: string): Promise<ClaudeSession> {
    // No CLI action needed under this model — the next sendInstruction
    // naturally resumes via --resume. Purely a domain-level transition.
    const restarted = this.applyAndEmit(this.requireSession(sessionId), "STARTING");
    return this.applyAndEmit(restarted, "WORKING");
  }

  async stopSession(sessionId: string): Promise<void> {
    const kill = this.inFlightKill.get(sessionId);
    if (kill) {
      kill();
    }
    const session = this.applyAndEmit(this.requireSession(sessionId), "STOPPED");
    this.emit(session.id, "stopped", {});
  }

  async getStatus(sessionId: string): Promise<SessionStatus> {
    return this.requireSession(sessionId).status;
  }

  async getSession(sessionId: string): Promise<ClaudeSession> {
    return this.requireSession(sessionId);
  }

  async rehydrate(session: ClaudeSession, projectPath: string): Promise<void> {
    if (this.sessions.has(session.id)) {
      return;
    }
    this.sessions.set(session.id, session);
    this.projectPaths.set(session.id, projectPath);
  }

  subscribe(sessionId: string, handler: SessionEventHandler): Unsubscribe {
    const set = this.listeners.get(sessionId) ?? new Set();
    set.add(handler);
    this.listeners.set(sessionId, set);
    return () => set.delete(handler);
  }

  private async dispatch(session: ClaudeSession, instruction: string): Promise<InstructionResult> {
    const projectPath = this.projectPaths.get(session.id);
    const args = [
      "-p",
      instruction,
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      this.options.permissionMode ?? "dontAsk",
    ];
    if (this.options.restricted) {
      args.push("--restricted");
    }
    if (session.claudeSessionId) {
      args.push("--resume", session.claudeSessionId);
    } else {
      args.push("--session-id", randomUUID());
    }

    const { result, kill } = this.runCli(args, projectPath !== undefined ? { cwd: projectPath } : {});
    this.inFlightKill.set(session.id, kill);
    let cliResult;
    try {
      cliResult = await result;
    } finally {
      this.inFlightKill.delete(session.id);
    }

    const parsed = parseStreamJsonOutput(cliResult.stdout);
    this.emit(session.id, "output", { output: parsed.outputText });

    // Re-read current state rather than trusting the `session` closure: it
    // may have changed (e.g. stopSession()) while this dispatch was in
    // flight. Using the stale value here would let a just-finished dispatch
    // silently clobber a concurrent stop — the state machine can only
    // protect against that if we hand it the real current state.
    const current = this.requireSession(session.id);
    const isTerminal = parsed.status === "completed" || parsed.status === "failed";
    let withClaudeId: ClaudeSession = {
      ...current,
      lastOutput: parsed.outputText,
      lastError: parsed.error ?? null,
      currentTask: isTerminal ? null : current.currentTask,
    };
    if (parsed.claudeSessionId && parsed.claudeSessionId !== current.claudeSessionId) {
      withClaudeId = { ...withClaudeId, claudeSessionId: parsed.claudeSessionId };
    }
    this.sessions.set(current.id, withClaudeId);

    const final = this.applyAndEmit(withClaudeId, INSTRUCTION_OUTCOME_TO_STATUS[parsed.status]);
    if (final.status === "COMPLETED") {
      this.emit(final.id, "completed", {});
    } else if (final.status === "FAILED") {
      this.emit(final.id, "failed", { error: parsed.error });
    }

    return {
      status: parsed.status,
      output: parsed.outputText,
      ...(parsed.error !== undefined ? { error: parsed.error } : {}),
    };
  }

  private requireSession(sessionId: string): ClaudeSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    return session;
  }

  private applyAndEmit(session: ClaudeSession, target: SessionStatus): ClaudeSession {
    const previous = session.status;
    const next = transitionSession(session, target, this.logger);
    this.sessions.set(next.id, next);
    if (next.status !== previous) {
      this.emit(next.id, "status_changed", { previous, current: next.status });
    }
    return next;
  }

  private emit(sessionId: string, type: SessionAdapterEventType, data: unknown): void {
    const event: SessionAdapterEvent = { type, sessionId, timestamp: nowIso(), data };
    for (const handler of this.listeners.get(sessionId) ?? []) {
      handler(event);
    }
  }
}
