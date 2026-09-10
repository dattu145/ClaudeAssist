import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createLogger } from "@claudeops/logging";
import type { DomainEvent } from "@claudeops/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../db/migrate.js";
import { SqliteProjectRepository } from "../../adapters/persistence/sqlite/project-repository.js";
import { SqliteSessionRepository } from "../../adapters/persistence/sqlite/session-repository.js";
import { FakeClaudeSessionAdapter } from "../../adapters/fake/fake-claude-session-adapter.js";
import { createProject } from "../project/entity.js";
import { createSession } from "../session/entity.js";
import { InProcessEventBus } from "../events/bus.js";
import type { DiscoveredClaudeProcess } from "../session/adapter.js";
import type { ProcessDiscoveryService, ProcessInfo } from "../process-discovery/service.js";
import { Reconciler } from "./reconciler.js";

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

function noopProcessDiscovery(claudeProcesses: ProcessInfo[] = []): ProcessDiscoveryService {
  return {
    listProcesses: () => Promise.resolve(claudeProcesses),
    findClaudeProcesses: () => Promise.resolve(claudeProcesses),
  };
}

describe("Reconciler", () => {
  let db: Database.Database;
  let projectRepo: SqliteProjectRepository;
  let sessionRepo: SqliteSessionRepository;
  let projectDir: string;
  let projectId: string;

  beforeEach(async () => {
    db = new Database(":memory:");
    runMigrations(db);
    projectRepo = new SqliteProjectRepository(db);
    sessionRepo = new SqliteSessionRepository(db);

    projectDir = mkdtempSync(join(tmpdir(), "claudeops-reconciler-"));
    const project = createProject({ name: "Website", path: projectDir });
    await projectRepo.create(project);
    projectId = project.id;
  });

  afterEach(() => {
    db.close();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("marks a WORKING session with no adapter knowledge as DISCONNECTED", async () => {
    const session = { ...createSession({ projectId }), status: "WORKING" as const };
    await sessionRepo.create(session);

    const adapter = new FakeClaudeSessionAdapter(silentLogger()); // empty — knows nothing
    const eventBus = new InProcessEventBus(silentLogger());
    const published: DomainEvent[] = [];
    eventBus.subscribe((e) => published.push(e));

    const reconciler = new Reconciler(
      sessionRepo,
      projectRepo,
      adapter,
      noopProcessDiscovery(),
      eventBus,
      silentLogger()
    );

    const summary = await reconciler.reconcile();

    expect(summary.disconnectedSessionIds).toEqual([session.id]);
    const persisted = await sessionRepo.findById(session.id);
    expect(persisted?.status).toBe("DISCONNECTED");
    expect(published.some((e) => e.type === "SESSION_DISCONNECTED")).toBe(true);
  });

  it.each(["COMPLETED", "FAILED", "STOPPED", "DISCONNECTED", "UNKNOWN"] as const)(
    "leaves a %s session untouched",
    async (status) => {
      const session = { ...createSession({ projectId }), status };
      await sessionRepo.create(session);

      const adapter = new FakeClaudeSessionAdapter(silentLogger());
      const eventBus = new InProcessEventBus(silentLogger());
      const reconciler = new Reconciler(
        sessionRepo,
        projectRepo,
        adapter,
        noopProcessDiscovery(),
        eventBus,
        silentLogger()
      );

      await reconciler.reconcile();

      const persisted = await sessionRepo.findById(session.id);
      expect(persisted?.status).toBe(status);
    }
  );

  it("creates a DISCOVERED session for an unmanaged process matching a registered project", async () => {
    const adapter = new FakeClaudeSessionAdapter(silentLogger());
    const discovered: DiscoveredClaudeProcess = {
      pid: 999,
      cwd: projectDir,
      kind: "interactive",
      claudeSessionId: "claude-uuid-1",
      name: "manual-session",
      status: "idle",
      backgroundId: null,
    };
    adapter.discoverSessions = () => Promise.resolve([discovered]);

    const eventBus = new InProcessEventBus(silentLogger());
    const published: DomainEvent[] = [];
    eventBus.subscribe((e) => published.push(e));

    const reconciler = new Reconciler(
      sessionRepo,
      projectRepo,
      adapter,
      noopProcessDiscovery(),
      eventBus,
      silentLogger()
    );

    const summary = await reconciler.reconcile();

    expect(summary.discoveredSessions).toHaveLength(1);
    expect(summary.discoveredSessions[0]?.projectId).toBe(projectId);
    expect(summary.discoveredSessions[0]?.claudeSessionId).toBe("claude-uuid-1");
    expect(summary.discoveredSessions[0]?.status).toBe("DISCOVERED");
    expect(published.some((e) => e.type === "SESSION_DISCOVERED")).toBe(true);
  });

  it("skips (and counts) an unmanaged process with no matching project", async () => {
    const adapter = new FakeClaudeSessionAdapter(silentLogger());
    adapter.discoverSessions = () =>
      Promise.resolve([
        {
          pid: 999,
          cwd: "/somewhere/unregistered",
          kind: "interactive",
          claudeSessionId: "claude-uuid-2",
          name: null,
          status: null,
          backgroundId: null,
        },
      ]);

    const eventBus = new InProcessEventBus(silentLogger());
    const reconciler = new Reconciler(
      sessionRepo,
      projectRepo,
      adapter,
      noopProcessDiscovery(),
      eventBus,
      silentLogger()
    );

    const summary = await reconciler.reconcile();

    expect(summary.discoveredSessions).toHaveLength(0);
    expect(summary.unmatchedProcessCount).toBe(1);
  });

  it("does not re-discover a process whose claudeSessionId is already persisted", async () => {
    const existing = { ...createSession({ projectId, claudeSessionId: "claude-uuid-3" }), status: "IDLE" as const };
    await sessionRepo.create(existing);

    const adapter = new FakeClaudeSessionAdapter(silentLogger());
    adapter.discoverSessions = () =>
      Promise.resolve([
        {
          pid: 1,
          cwd: projectDir,
          kind: "interactive",
          claudeSessionId: "claude-uuid-3",
          name: null,
          status: "idle",
          backgroundId: null,
        },
      ]);

    const eventBus = new InProcessEventBus(silentLogger());
    const reconciler = new Reconciler(
      sessionRepo,
      projectRepo,
      adapter,
      noopProcessDiscovery(),
      eventBus,
      silentLogger()
    );

    const summary = await reconciler.reconcile();

    expect(summary.discoveredSessions).toHaveLength(0);
  });

  it("logs a warning (but changes nothing) when ProcessDiscoveryService finds an unaccounted claude process", async () => {
    const adapter = new FakeClaudeSessionAdapter(silentLogger()); // discoverSessions() -> []
    const eventBus = new InProcessEventBus(silentLogger());
    const lines: unknown[] = [];
    const warningLogger = createLogger(
      { component: "test" },
      { write: (l) => lines.push(JSON.parse(l)) }
    );

    const reconciler = new Reconciler(
      sessionRepo,
      projectRepo,
      adapter,
      noopProcessDiscovery([{ pid: 4242, name: "claude.exe", commandLine: null, parentPid: null }]),
      eventBus,
      warningLogger
    );

    await reconciler.reconcile();
    await reconciler.runProcessDiscoveryCrossCheckInBackground();

    expect(
      lines.some(
        (l) =>
          typeof l === "object" &&
          l !== null &&
          (l as { message?: string }).message ===
            "found claude OS processes not reported by claude agents --json"
      )
    ).toBe(true);
  });

  it("reconcile() alone does not run the process discovery cross-check (kept off the blocking path)", async () => {
    const adapter = new FakeClaudeSessionAdapter(silentLogger());
    const eventBus = new InProcessEventBus(silentLogger());
    let findClaudeProcessesCalls = 0;
    const trackedProcessDiscovery: ProcessDiscoveryService = {
      listProcesses: () => Promise.resolve([]),
      findClaudeProcesses: () => {
        findClaudeProcessesCalls += 1;
        return Promise.resolve([]);
      },
    };

    const reconciler = new Reconciler(
      sessionRepo,
      projectRepo,
      adapter,
      trackedProcessDiscovery,
      eventBus,
      silentLogger()
    );

    await reconciler.reconcile();

    expect(findClaudeProcessesCalls).toBe(0);
  });
});
