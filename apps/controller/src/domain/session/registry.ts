import type { ClaudeSession } from "@claudeops/protocol";
import type { ProjectRegistry } from "../project/registry.js";
import { SessionNotFoundError } from "../errors.js";
import type {
  ClaudeSessionAdapter,
  InstructionResult,
  SessionEventHandler,
  Unsubscribe,
} from "./adapter.js";
import type { SessionRepository } from "./repository.js";

export interface StartSessionRegistryInput {
  projectId: string;
  initialInstruction?: string;
  name?: string;
}

/**
 * Wraps a ClaudeSessionAdapter (page7/page8) with SQLite persistence,
 * status tracking, and event subscription — the entity/repository/registry
 * layering page6 established for projects, applied to sessions. Never
 * talks to SQLite or a specific adapter implementation directly, only the
 * SessionRepository/ClaudeSessionAdapter interfaces, so it works
 * identically against FakeClaudeSessionAdapter (tests) or ClaudeCodeAdapter
 * (production).
 */
export class SessionRegistry {
  constructor(
    private readonly repository: SessionRepository,
    private readonly adapter: ClaudeSessionAdapter,
    private readonly projectRegistry: ProjectRegistry
  ) {}

  async startSession(input: StartSessionRegistryInput): Promise<ClaudeSession> {
    // Resolves via ProjectRegistry (throws ProjectNotFoundError if
    // unknown) — this is how "associate session with project" is enforced;
    // no session is ever created for an unregistered project.
    const project = await this.projectRegistry.getProject(input.projectId);

    const session = await this.adapter.startSession({
      projectId: project.id,
      projectPath: project.path,
      ...(input.initialInstruction !== undefined
        ? { initialInstruction: input.initialInstruction }
        : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
    });

    await this.repository.create(session);
    return session;
  }

  async getSession(id: string): Promise<ClaudeSession> {
    const session = await this.repository.findById(id);
    if (!session) {
      throw new SessionNotFoundError(id);
    }
    return session;
  }

  async listSessions(projectId?: string): Promise<ClaudeSession[]> {
    return projectId ? this.repository.listByProject(projectId) : this.repository.list();
  }

  async sendInstruction(sessionId: string, instruction: string): Promise<InstructionResult> {
    await this.getSession(sessionId);
    const result = await this.adapter.sendInstruction(sessionId, instruction);
    await this.syncFromAdapter(sessionId);
    return result;
  }

  async resumeSession(sessionId: string): Promise<ClaudeSession> {
    await this.getSession(sessionId);
    await this.adapter.resumeSession(sessionId);
    return this.syncFromAdapter(sessionId);
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.getSession(sessionId);
    await this.adapter.stopSession(sessionId);
    await this.syncFromAdapter(sessionId);
  }

  /** Thin delegation — the "event emission" hook page10's event bus
   * consumes. Not a second pub-sub layer; the adapter's is authoritative. */
  subscribe(sessionId: string, handler: SessionEventHandler): Unsubscribe {
    return this.adapter.subscribe(sessionId, handler);
  }

  private async syncFromAdapter(sessionId: string): Promise<ClaudeSession> {
    const current = await this.adapter.getSession(sessionId);
    await this.repository.update(current);
    return current;
  }
}
