import type { ClaudeSession, SessionStatus } from "@claudeops/protocol";

/**
 * The port the Session Registry (page9) depends on. Adapted from the
 * spec's conceptual interface after weighing it against
 * .claude/research/claude-code.md's findings on the real Claude Code CLI —
 * per the spec's own instruction not to blindly use the conceptual shape if
 * the real interfaces suggest a better design. The one deliberate addition
 * is `projectPath` on StartSessionInput: the real adapter (page8) needs a
 * cwd to spawn `claude` in, which the spec's example omits.
 */
export interface StartSessionInput {
  projectId: string;
  projectPath: string;
  initialInstruction?: string;
  name?: string;
}

/** Mirrors the session states an instruction dispatch can end in (see
 * .claude/architecture/session-model.md). */
export interface InstructionResult {
  status: "completed" | "waiting_for_input" | "waiting_for_permission" | "failed";
  output?: string;
  error?: string;
}

export type SessionAdapterEventType =
  | "output"
  | "status_changed"
  | "completed"
  | "failed"
  | "stopped"
  | "disconnected";

/**
 * Deliberately minimal — `data` is `unknown` because page9/page10 (which
 * translate this into a DomainEvent) haven't landed yet and this page
 * should not guess at that shape.
 */
export interface SessionAdapterEvent {
  type: SessionAdapterEventType;
  sessionId: string;
  timestamp: string;
  data: unknown;
}

export type SessionEventHandler = (event: SessionAdapterEvent) => void;
export type Unsubscribe = () => void;

export interface ClaudeSessionAdapter {
  discoverSessions(): Promise<ClaudeSession[]>;
  startSession(input: StartSessionInput): Promise<ClaudeSession>;
  sendInstruction(sessionId: string, instruction: string): Promise<InstructionResult>;
  resumeSession(sessionId: string): Promise<ClaudeSession>;
  stopSession(sessionId: string): Promise<void>;
  getStatus(sessionId: string): Promise<SessionStatus>;
  subscribe(sessionId: string, handler: SessionEventHandler): Unsubscribe;
}
