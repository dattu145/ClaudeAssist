import Database from "better-sqlite3";
import { createLogger } from "@claudeops/logging";
import type { Express } from "express";
import { runMigrations } from "../db/migrate.js";
import { SqliteProjectRepository } from "../adapters/persistence/sqlite/project-repository.js";
import { SqliteSessionRepository } from "../adapters/persistence/sqlite/session-repository.js";
import { SqliteTaskRepository } from "../adapters/persistence/sqlite/task-repository.js";
import { SqliteEventRepository } from "../adapters/persistence/sqlite/event-repository.js";
import { FakeClaudeSessionAdapter } from "../adapters/fake/fake-claude-session-adapter.js";
import { ProjectRegistry } from "../domain/project/registry.js";
import { SessionRegistry } from "../domain/session/registry.js";
import { TaskRegistry } from "../domain/task/registry.js";
import { InProcessEventBus } from "../domain/events/bus.js";
import { wireEventPersistence } from "../domain/events/wire-persistence.js";
import { SqlitePairingRepository } from "../adapters/persistence/sqlite/pairing-repository.js";
import { PairingRegistry } from "../domain/pairing/registry.js";
import { createApp } from "../server.js";

export interface TestAppContext {
  app: Express;
  db: Database.Database;
  projectRegistry: ProjectRegistry;
  sessionRegistry: SessionRegistry;
  taskRegistry: TaskRegistry;
  pairingRegistry: PairingRegistry;
  adapter: FakeClaudeSessionAdapter;
  /** A valid bearer token, already issued — most route tests just need to
   * authenticate, not exercise the pairing flow itself. */
  authToken: string;
}

/**
 * Shared route-test fixture: real (in-memory) SQLite repositories behind
 * FakeClaudeSessionAdapter, matching what a running controller wires
 * (lifecycle.ts) but without touching the real claude CLI. Extracted
 * page12 after the third HTTP test file needed the identical setup;
 * page14 added pairing/auth wiring so every non-pairing route test can
 * authenticate with `authToken`.
 */
export async function buildTestApp(
  checkClaudeCli: () => Promise<boolean> = () => Promise.resolve(true)
): Promise<TestAppContext> {
  const db = new Database(":memory:");
  runMigrations(db);
  const logger = createLogger({ component: "test" }, { write: () => {} });

  const projectRegistry = new ProjectRegistry(new SqliteProjectRepository(db));
  const eventBus = new InProcessEventBus(logger);
  const eventRepository = new SqliteEventRepository(db);
  wireEventPersistence(eventBus, eventRepository, logger);

  const adapter = new FakeClaudeSessionAdapter(logger);
  const sessionRegistry = new SessionRegistry(
    new SqliteSessionRepository(db),
    adapter,
    projectRegistry,
    eventBus
  );
  const taskRegistry = new TaskRegistry(new SqliteTaskRepository(db), sessionRegistry, logger);
  const pairingRegistry = new PairingRegistry(new SqlitePairingRepository(db), logger, 2_592_000);

  const app = createApp({
    db,
    startedAt: Date.now(),
    logger,
    checkClaudeCli,
    projectRegistry,
    sessionRegistry,
    taskRegistry,
    eventRepository,
    pairingRegistry,
  });

  const code = await pairingRegistry.issueStartupCode();
  const { token: authToken } = await pairingRegistry.exchangeCode(code);

  return {
    app,
    db,
    projectRegistry,
    sessionRegistry,
    taskRegistry,
    pairingRegistry,
    adapter,
    authToken,
  };
}
