import { generateId, nowIso } from "@claudeops/shared";
import { DomainEventSchema, type ClaudeSession, type DomainEvent, type DomainEventType, type SessionStatus } from "@claudeops/protocol";
import type { Logger } from "@claudeops/logging";
import type { SessionRepository } from "../session/repository.js";
import type { ProjectRepository } from "../project/repository.js";
import type { ClaudeSessionAdapter, DiscoveredClaudeProcess } from "../session/adapter.js";
import type { ProcessDiscoveryService } from "../process-discovery/service.js";
import { createSession, transitionSession } from "../session/entity.js";
import type { EventBus } from "../events/bus.js";
import { isSamePath } from "./paths.js";

/**
 * Statuses that imply a session was mid-flight when the controller last
 * ran. Under our adapter design (page8: no persistent process between
 * dispatches, no --bg), a fresh ClaudeCodeAdapter instance starts with an
 * empty in-memory session map on every restart — it has no way to "still
 * know about" one of these, regardless of whether any process happens to
 * be running. See .claude/plans/page16.md for why this replaces the
 * originally-envisioned live cross-reference against `claude agents
 * --json`.
 */
const STALE_ON_RESTART_STATUSES: readonly SessionStatus[] = [
  "STARTING",
  "WORKING",
  "WAITING_FOR_INPUT",
  "WAITING_FOR_PERMISSION",
];

export interface ReconciliationSummary {
  disconnectedSessionIds: string[];
  discoveredSessions: ClaudeSession[];
  unmatchedProcessCount: number;
}

function buildReconciliationEvent(
  type: DomainEventType,
  session: ClaudeSession,
  payload: unknown
): DomainEvent {
  return DomainEventSchema.parse({
    id: generateId("event"),
    type,
    timestamp: nowIso(),
    sessionId: session.id,
    projectId: session.projectId,
    payload,
    source: "system",
  });
}

export class Reconciler {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly adapter: ClaudeSessionAdapter,
    private readonly processDiscovery: ProcessDiscoveryService,
    private readonly eventBus: EventBus,
    private readonly logger: Logger
  ) {}

  /**
   * The state-correcting half — must finish before the HTTP/WS servers
   * accept traffic (architecture/controller.md). Deliberately does NOT
   * include the ProcessDiscoveryService cross-check: measured for real on
   * this machine, a single PowerShell invocation costs ~7s of pure
   * process-startup overhead (confirmed with a trivial `Write-Output`
   * call — not the cmdlet's fault). That check is diagnostic-only and
   * never drives state (page15), so it doesn't belong on the
   * before-serving-traffic critical path — see
   * `runProcessDiscoveryCrossCheckInBackground`.
   */
  async reconcile(): Promise<ReconciliationSummary> {
    const disconnectedSessionIds = await this.disconnectStaleSessions();
    const cliProcesses = await this.adapter.discoverSessions();
    const { discoveredSessions, unmatchedProcessCount } = await this.discoverUnmanagedSessions(
      cliProcesses
    );

    this.logger.info("startup reconciliation complete", {
      disconnected: disconnectedSessionIds.length,
      discovered: discoveredSessions.length,
      unmatchedProcesses: unmatchedProcessCount,
    });

    return { disconnectedSessionIds, discoveredSessions, unmatchedProcessCount };
  }

  /**
   * Intended to be called without awaiting in production (hence
   * "InBackground") — after, or concurrently with, the server starting to
   * accept traffic. Returns the promise anyway (never rejects; errors are
   * caught and logged internally) so tests can await completion instead
   * of racing a fire-and-forget call.
   */
  async runProcessDiscoveryCrossCheckInBackground(): Promise<void> {
    try {
      const cliProcesses = await this.adapter.discoverSessions();
      await this.crossCheckProcessDiscovery(cliProcesses);
    } catch (err) {
      this.logger.warn("process discovery cross-check failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async disconnectStaleSessions(): Promise<string[]> {
    const persisted = await this.sessionRepository.list();
    const ids: string[] = [];

    for (const session of persisted) {
      if (!STALE_ON_RESTART_STATUSES.includes(session.status)) {
        continue;
      }
      const previous = session.status;
      const next = transitionSession(session, "DISCONNECTED", this.logger);
      if (next.status !== "DISCONNECTED") {
        continue; // state machine rejected it — shouldn't happen given the table, but never assume
      }
      await this.sessionRepository.update(next);
      ids.push(next.id);
      this.eventBus.publish(
        buildReconciliationEvent("SESSION_DISCONNECTED", next, {
          previous,
          current: "DISCONNECTED",
          reason: "stale_on_restart",
        })
      );
    }

    return ids;
  }

  private async discoverUnmanagedSessions(processes: DiscoveredClaudeProcess[]): Promise<{
    discoveredSessions: ClaudeSession[];
    unmatchedProcessCount: number;
  }> {
    const [persisted, projects] = await Promise.all([
      this.sessionRepository.list(),
      this.projectRepository.list(),
    ]);

    const knownClaudeSessionIds = new Set(
      persisted.map((s) => s.claudeSessionId).filter((id): id is string => id !== null)
    );

    const discoveredSessions: ClaudeSession[] = [];
    let unmatchedProcessCount = 0;

    for (const proc of processes) {
      if (knownClaudeSessionIds.has(proc.claudeSessionId)) {
        continue;
      }

      const project = projects.find((p) => isSamePath(p.path, proc.cwd));
      if (!project) {
        unmatchedProcessCount += 1;
        this.logger.warn("discovered claude process with no matching registered project", {
          cwd: proc.cwd,
          pid: proc.pid,
        });
        continue;
      }

      const session = createSession({ projectId: project.id, claudeSessionId: proc.claudeSessionId });
      await this.sessionRepository.create(session);
      discoveredSessions.push(session);
      this.eventBus.publish(
        buildReconciliationEvent("SESSION_DISCOVERED", session, { cwd: proc.cwd, pid: proc.pid })
      );
    }

    return { discoveredSessions, unmatchedProcessCount };
  }

  /** Diagnostic only, per page15 — never drives session state. */
  private async crossCheckProcessDiscovery(cliProcesses: DiscoveredClaudeProcess[]): Promise<void> {
    try {
      const osClaudeProcesses = await this.processDiscovery.findClaudeProcesses();
      const knownPids = new Set(cliProcesses.map((p) => p.pid));
      const unaccounted = osClaudeProcesses.filter((p) => !knownPids.has(p.pid));
      if (unaccounted.length > 0) {
        this.logger.warn("found claude OS processes not reported by claude agents --json", {
          count: unaccounted.length,
          pids: unaccounted.map((p) => p.pid),
        });
      }
    } catch (err) {
      this.logger.warn("process discovery cross-check failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
