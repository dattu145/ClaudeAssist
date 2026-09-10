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

/**
 * Deterministic, in-memory ClaudeSessionAdapter for tests (see
 * .claude/TEST_PLAN.md "Adapter (fake)" layer). Drives sessions through the
 * real page5 state machine — never invents its own status transitions —
 * so tests exercising this fake exercise the same rules the real adapter
 * (page8) must obey.
 */
export class FakeClaudeSessionAdapter implements ClaudeSessionAdapter {
  private readonly sessions = new Map<string, ClaudeSession>();
  private readonly projectPaths = new Map<string, string>();
  private readonly listeners = new Map<string, Set<SessionEventHandler>>();
  private readonly queuedOutcomes = new Map<string, InstructionResult["status"]>();
  private nextFakePid = 1;

  constructor(private readonly logger: Logger) {}

  /** Test-only hook, not part of the ClaudeSessionAdapter port: scripts the
   * outcome of the *next* sendInstruction call for a session (one-shot). */
  queueInstructionOutcome(sessionId: string, outcome: InstructionResult["status"]): void {
    this.queuedOutcomes.set(sessionId, outcome);
  }

  async discoverSessions(): Promise<DiscoveredClaudeProcess[]> {
    return [...this.sessions.values()].map((session) => ({
      pid: this.nextFakePid++,
      cwd: this.projectPaths.get(session.id) ?? "",
      kind: "background",
      claudeSessionId: session.claudeSessionId ?? session.id,
      name: null,
      status: session.status === "WORKING" ? "busy" : "idle",
      backgroundId: null,
    }));
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
      this.dispatchInstruction(session, input.initialInstruction);
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
    return this.dispatchInstruction(working, instruction);
  }

  async resumeSession(sessionId: string): Promise<ClaudeSession> {
    const restarted = this.applyAndEmit(this.requireSession(sessionId), "STARTING");
    return this.applyAndEmit(restarted, "WORKING");
  }

  async stopSession(sessionId: string): Promise<void> {
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

  private dispatchInstruction(session: ClaudeSession, instruction: string): InstructionResult {
    const outcome = this.queuedOutcomes.get(session.id) ?? "completed";
    this.queuedOutcomes.delete(session.id);

    const output = `[fake] handled: ${instruction}`;
    this.emit(session.id, "output", { output });

    const isTerminal = outcome === "completed" || outcome === "failed";
    const updated: ClaudeSession = {
      ...session,
      lastOutput: output,
      lastError: outcome === "failed" ? "fake failure" : null,
      currentTask: isTerminal ? null : session.currentTask,
    };
    this.sessions.set(updated.id, updated);

    const final = this.applyAndEmit(updated, INSTRUCTION_OUTCOME_TO_STATUS[outcome]);
    if (final.status === "COMPLETED") {
      this.emit(final.id, "completed", {});
    } else if (final.status === "FAILED") {
      this.emit(final.id, "failed", { error: "fake failure" });
    }

    return {
      status: outcome,
      output,
      ...(outcome === "failed" ? { error: "fake failure" } : {}),
    };
  }

  private emit(sessionId: string, type: SessionAdapterEventType, data: unknown): void {
    const event: SessionAdapterEvent = { type, sessionId, timestamp: nowIso(), data };
    for (const handler of this.listeners.get(sessionId) ?? []) {
      handler(event);
    }
  }
}
