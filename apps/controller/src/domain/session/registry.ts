import { generateId } from "@claudeops/shared";
import type { ClaudeSession } from "@claudeops/protocol";
import type { ProjectRegistry } from "../project/registry.js";
import { SessionNotFoundError } from "../errors.js";
import type { EventBus } from "../events/bus.js";
import { translateSessionEvent } from "../events/translate-session-event.js";
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
 * status tracking, and event publication — the entity/repository/registry
 * layering page6 established for projects, applied to sessions. Never
 * talks to SQLite or a specific adapter implementation directly, only the
 * SessionRepository/ClaudeSessionAdapter interfaces, so it works
 * identically against FakeClaudeSessionAdapter (tests) or ClaudeCodeAdapter
 * (production).
 */
export class SessionRegistry {
  /** Session ids already subscribed to the adapter's event stream in
   * this process — guards ensureSubscribed against double-subscribing
   * (subscribe() has no dedupe semantics of its own, so a second call
   * for the same session would deliver every event twice). */
  private readonly subscribedSessionIds = new Set<string>();

  constructor(
    private readonly repository: SessionRepository,
    private readonly adapter: ClaudeSessionAdapter,
    private readonly projectRegistry: ProjectRegistry,
    private readonly eventBus: EventBus
  ) {}

  async startSession(input: StartSessionRegistryInput): Promise<ClaudeSession> {
    // Resolves via ProjectRegistry (throws ProjectNotFoundError if
    // unknown) — this is how "associate session with project" is enforced;
    // no session is ever created for an unregistered project.
    const project = await this.projectRegistry.getProject(input.projectId);

    // Generated upfront (page10) and subscribed to *before* calling the
    // adapter: an initial-instruction dispatch fires events inside
    // adapter.startSession itself, before it returns — subscribing
    // afterward would silently miss all of them.
    const sessionId = generateId("session");
    this.ensureSubscribed(sessionId, project.id);

    const session = await this.adapter.startSession({
      projectId: project.id,
      projectPath: project.path,
      sessionId,
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
    await this.ensureAdapterKnowsSession(sessionId);
    const result = await this.adapter.sendInstruction(sessionId, instruction);
    await this.syncFromAdapter(sessionId);
    return result;
  }

  async resumeSession(sessionId: string): Promise<ClaudeSession> {
    await this.ensureAdapterKnowsSession(sessionId);
    await this.adapter.resumeSession(sessionId);
    return this.syncFromAdapter(sessionId);
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.ensureAdapterKnowsSession(sessionId);
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

  private ensureSubscribed(sessionId: string, projectId: string): void {
    if (this.subscribedSessionIds.has(sessionId)) {
      return;
    }
    this.subscribedSessionIds.add(sessionId);
    this.adapter.subscribe(sessionId, (event) => {
      this.eventBus.publish(translateSessionEvent({ id: sessionId, projectId }, event));
    });
  }

  /** The persisted record always exists-or-throws (SessionNotFoundError)
   * regardless of restarts — SQLite, not the adapter, is the source of
   * truth for "does this session exist at all." What this actually
   * ensures is that the *adapter* has a working in-memory record too,
   * rehydrating it from persisted state on a fresh instance's first
   * touch of a session it doesn't recognize (page16: every restart
   * starts with an empty adapter). */
  private async ensureAdapterKnowsSession(sessionId: string): Promise<ClaudeSession> {
    const persisted = await this.getSession(sessionId);

    try {
      await this.adapter.getSession(sessionId);
      return persisted;
    } catch (err) {
      if (!(err instanceof SessionNotFoundError)) {
        throw err;
      }
    }

    const project = await this.projectRegistry.getProject(persisted.projectId);
    await this.adapter.rehydrate(persisted, project.path);
    this.ensureSubscribed(sessionId, persisted.projectId);
    return persisted;
  }
}
