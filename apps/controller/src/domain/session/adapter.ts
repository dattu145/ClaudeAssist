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
  /**
   * Added page10: an optional caller-supplied ClaudeOps session id (the
   * eventual `ClaudeSession.id`, distinct from `claudeSessionId` — the
   * real CLI's own conversation id). Lets `SessionRegistry` subscribe to
   * adapter events *before* calling `startSession`, so events fired during
   * an initial-instruction dispatch (which happens inside this same call)
   * aren't missed. Adapters generate their own id when omitted.
   */
  sessionId?: string;
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

/**
 * A process-level `claude` session found via `claude agents --json`
 * (see .claude/research/claude-code.md), *not* a ClaudeOps domain
 * `ClaudeSession` — discovery has no concept of `projectId` (a ClaudeOps
 * invention). Matching a discovered process to a registered `Project` by
 * `cwd` is the Session Registry's job (page9), not the adapter's. Amended
 * here (page8) from the original `discoverSessions(): Promise<ClaudeSession[]>`
 * signature, which turned out to be unimplementable by the real adapter.
 */
export interface DiscoveredClaudeProcess {
  pid: number;
  cwd: string;
  kind: "interactive" | "background";
  claudeSessionId: string;
  name: string | null;
  status: "busy" | "idle" | null;
  backgroundId: string | null;
}

export interface ClaudeSessionAdapter {
  discoverSessions(): Promise<DiscoveredClaudeProcess[]>;
  startSession(input: StartSessionInput): Promise<ClaudeSession>;
  sendInstruction(sessionId: string, instruction: string): Promise<InstructionResult>;
  resumeSession(sessionId: string): Promise<ClaudeSession>;
  stopSession(sessionId: string): Promise<void>;
  getStatus(sessionId: string): Promise<SessionStatus>;
  /**
   * Added page9: the Session Registry needs the *full* current record
   * (claudeSessionId, lastOutput, lastActivityAt, ...) after a dispatch to
   * persist accurately — `getStatus` alone isn't enough, and
   * `sendInstruction`/`resumeSession`/`stopSession`'s own return values
   * don't consistently carry it either. Throws SessionNotFoundError for an
   * unknown id, same as `getStatus`.
   */
  getSession(sessionId: string): Promise<ClaudeSession>;
  /**
   * Populates the adapter's in-memory record for a session from
   * persisted state, without any CLI/network I/O — the missing half of
   * "a fresh adapter instance has no memory of old sessions" (page16).
   * `SessionRegistry` calls this before a mutating call
   * (resumeSession/sendInstruction/stopSession) whose session the
   * adapter doesn't already know about, so a `DISCONNECTED` session
   * (the one status `SESSION_STATUS_TRANSITIONS` documents transitioning
   * *to* `STARTING`) can actually be resumed after a restart. Idempotent
   * — a no-op if the adapter already knows about this session.
   */
  rehydrate(session: ClaudeSession, projectPath: string): Promise<void>;
  subscribe(sessionId: string, handler: SessionEventHandler): Unsubscribe;
}
