import type { Server } from "node:http";
import type Database from "better-sqlite3";
import type { Config } from "@claudeops/config";
import type { Logger } from "@claudeops/logging";
import { openDatabase } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";
import { createApp } from "./server.js";
import { SqliteProjectRepository } from "./adapters/persistence/sqlite/project-repository.js";
import { SqliteSessionRepository } from "./adapters/persistence/sqlite/session-repository.js";
import { SqliteTaskRepository } from "./adapters/persistence/sqlite/task-repository.js";
import { SqliteEventRepository } from "./adapters/persistence/sqlite/event-repository.js";
import { ClaudeCodeAdapter } from "./adapters/claude-code/claude-code-adapter.js";
import { ProjectRegistry } from "./domain/project/registry.js";
import { SessionRegistry } from "./domain/session/registry.js";
import { TaskRegistry } from "./domain/task/registry.js";
import { InProcessEventBus } from "./domain/events/bus.js";
import { wireEventPersistence } from "./domain/events/wire-persistence.js";
import { wireNotifications } from "./domain/notification/wire-notifications.js";
import { ConsoleNotificationService } from "./adapters/notification/console-notification-service.js";
import { CommandRouter } from "./domain/command/router.js";
import type { BordioClient } from "./domain/bordio/client.js";
import { BordioApiClient } from "./adapters/bordio/bordio-client.js";
import { BordioNotificationService } from "./adapters/bordio/bordio-notification-service.js";
import { SqliteBordioLinkRepository } from "./adapters/persistence/sqlite/bordio-link-repository.js";
import { attachWebSocketServer } from "./api/ws/server.js";
import { SqlitePairingRepository } from "./adapters/persistence/sqlite/pairing-repository.js";
import { PairingRegistry } from "./domain/pairing/registry.js";
import { createProcessDiscoveryService } from "./adapters/process-discovery/create-process-discovery-service.js";
import { Reconciler } from "./domain/reconciliation/reconciler.js";
import type { ClaudeSessionAdapter } from "./domain/session/adapter.js";
import type { ProcessDiscoveryService } from "./domain/process-discovery/service.js";

const SHUTDOWN_TIMEOUT_MS = 5000;

export interface Controller {
  db: Database.Database;
  server: Server;
  stop: () => Promise<void>;
}

export interface StartControllerOverrides {
  /** Injectable for tests: the real ClaudeCodeAdapter and
   * ProcessDiscoveryService each spawn real subprocesses (the claude CLI,
   * PowerShell/ps), which reconciliation now calls on every startup —
   * fine for production, far too slow for a fast test suite. Defaults to
   * the real implementations when omitted. */
  claudeAdapter?: ClaudeSessionAdapter;
  processDiscovery?: ProcessDiscoveryService;
  /** Same reasoning — /health's default check also spawns `claude
   * --version` for real. */
  checkClaudeCli?: () => Promise<boolean>;
  /** Injectable for tests: substitute FakeBordioClient instead of a real
   * network client even when BORDIO_API_KEY is set (pageB3). Only
   * consulted when config.BORDIO_API_KEY is set — otherwise the Bordio
   * integration is skipped entirely, real or fake. */
  bordioClient?: BordioClient;
}

export async function startController(
  config: Config,
  logger: Logger,
  overrides: StartControllerOverrides = {}
): Promise<Controller> {
  const db = openDatabase(config.DATA_DIR);
  const applied = runMigrations(db);
  if (applied.length > 0) {
    logger.info("migrations applied", { applied });
  }

  const startedAt = Date.now();
  const projectRepository = new SqliteProjectRepository(db);
  const sessionRepository = new SqliteSessionRepository(db);
  const projectRegistry = new ProjectRegistry(projectRepository);

  const pairingRegistry = new PairingRegistry(
    new SqlitePairingRepository(db),
    logger.child({ component: "pairing" }),
    config.PAIRING_TOKEN_TTL
  );
  await pairingRegistry.issueStartupCode();

  const eventBus = new InProcessEventBus(logger.child({ component: "event-bus" }));
  const eventRepository = new SqliteEventRepository(db);
  wireEventPersistence(eventBus, eventRepository, logger.child({ component: "event-persistence" }));

  const notificationService = new ConsoleNotificationService(logger.child({ component: "notification" }));
  wireNotifications(eventBus, notificationService, logger.child({ component: "notification" }));

  // Off by default (decisions/ADR-006.md) — only constructed when
  // BORDIO_API_KEY is configured, real or fake alike.
  if (config.BORDIO_API_KEY) {
    const bordioClient =
      overrides.bordioClient ??
      new BordioApiClient(config.BORDIO_API_KEY, logger.child({ component: "bordio-client" }));
    const bordioNotificationService = new BordioNotificationService(
      bordioClient,
      new SqliteBordioLinkRepository(db),
      logger.child({ component: "bordio-notification" }),
      {
        ...(config.BORDIO_OPEN_STATUS_ID ? { openStatusId: config.BORDIO_OPEN_STATUS_ID } : {}),
        ...(config.BORDIO_CLOSED_STATUS_ID ? { closedStatusId: config.BORDIO_CLOSED_STATUS_ID } : {}),
      }
    );
    wireNotifications(eventBus, bordioNotificationService, logger.child({ component: "bordio-notification" }));
  }

  const claudeAdapter =
    overrides.claudeAdapter ?? new ClaudeCodeAdapter(logger.child({ component: "claude-code-adapter" }));
  const sessionRegistry = new SessionRegistry(sessionRepository, claudeAdapter, projectRegistry, eventBus);
  const taskRegistry = new TaskRegistry(
    new SqliteTaskRepository(db),
    sessionRegistry,
    logger.child({ component: "task-registry" })
  );
  const commandRouter = new CommandRouter(sessionRegistry, taskRegistry);

  // Runs before the HTTP server starts accepting traffic (architecture/
  // controller.md) — persisted state must never lie about what's actually
  // happening once the server is reachable.
  const processDiscovery = overrides.processDiscovery ?? createProcessDiscoveryService();
  const reconciler = new Reconciler(
    sessionRepository,
    projectRepository,
    claudeAdapter,
    processDiscovery,
    eventBus,
    logger.child({ component: "reconciliation" })
  );
  let lastReconciliationAt: string | null = null;
  await reconciler.reconcile();
  lastReconciliationAt = new Date().toISOString();
  // Diagnostic-only, never drives state — deliberately not awaited (see
  // Reconciler.runProcessDiscoveryCrossCheckInBackground's docstring for
  // why: a single PowerShell invocation costs ~7s of pure process-startup
  // overhead on this dev machine, measured for real).
  void reconciler.runProcessDiscoveryCrossCheckInBackground();

  const app = createApp({
    db,
    startedAt,
    logger: logger.child({ component: "http" }),
    projectRegistry,
    sessionRegistry,
    taskRegistry,
    eventRepository,
    pairingRegistry,
    commandRouter,
    getLastReconciliationAt: () => lastReconciliationAt,
    ...(overrides.checkClaudeCli ? { checkClaudeCli: overrides.checkClaudeCli } : {}),
  });

  const server = app.listen(config.PORT, () => {
    logger.info("controller listening", { port: config.PORT });
  });

  const wss = attachWebSocketServer(
    server,
    eventBus,
    pairingRegistry,
    logger.child({ component: "ws" })
  );

  let stopped = false;
  const stop = (): Promise<void> => {
    if (stopped) {
      return Promise.resolve();
    }
    stopped = true;

    return new Promise((resolve) => {
      const forceTimer = setTimeout(() => {
        logger.warn("shutdown timeout exceeded, forcing close");
        db.close();
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);
      forceTimer.unref();

      // wss.close() alone neither closes already-open sockets nor the
      // shared http.Server — terminate clients explicitly and close the
      // WS server before the HTTP server, so shutdown never hangs on a
      // lingering connection.
      for (const client of wss.clients) {
        client.terminate();
      }
      wss.close(() => {
        server.close(() => {
          clearTimeout(forceTimer);
          db.close();
          logger.info("controller stopped");
          resolve();
        });
      });
    });
  };

  return { db, server, stop };
}

export function registerShutdownHandlers(controller: Controller, logger: Logger): void {
  let shuttingDown = false;

  const handle = (signal: string) => {
    if (shuttingDown) {
      logger.warn("second shutdown signal received, forcing exit", { signal });
      process.exit(1);
    }
    shuttingDown = true;
    logger.info("shutdown signal received", { signal });
    controller
      .stop()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error("error during shutdown", {
          error: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
      });
  };

  process.on("SIGINT", () => handle("SIGINT"));
  process.on("SIGTERM", () => handle("SIGTERM"));
}
