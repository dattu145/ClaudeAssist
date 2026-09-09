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
import { attachWebSocketServer } from "./api/ws/server.js";

const SHUTDOWN_TIMEOUT_MS = 5000;

export interface Controller {
  db: Database.Database;
  server: Server;
  stop: () => Promise<void>;
}

export function startController(config: Config, logger: Logger): Controller {
  const db = openDatabase(config.DATA_DIR);
  const applied = runMigrations(db);
  if (applied.length > 0) {
    logger.info("migrations applied", { applied });
  }

  const startedAt = Date.now();
  const projectRegistry = new ProjectRegistry(new SqliteProjectRepository(db));

  const eventBus = new InProcessEventBus(logger.child({ component: "event-bus" }));
  const eventRepository = new SqliteEventRepository(db);
  wireEventPersistence(eventBus, eventRepository, logger.child({ component: "event-persistence" }));

  const claudeAdapter = new ClaudeCodeAdapter(logger.child({ component: "claude-code-adapter" }));
  const sessionRegistry = new SessionRegistry(
    new SqliteSessionRepository(db),
    claudeAdapter,
    projectRegistry,
    eventBus
  );
  const taskRegistry = new TaskRegistry(
    new SqliteTaskRepository(db),
    sessionRegistry,
    logger.child({ component: "task-registry" })
  );

  const app = createApp({
    db,
    startedAt,
    logger: logger.child({ component: "http" }),
    projectRegistry,
    sessionRegistry,
    taskRegistry,
    eventRepository,
  });

  const server = app.listen(config.PORT, () => {
    logger.info("controller listening", { port: config.PORT });
  });

  const wss = attachWebSocketServer(server, eventBus, logger.child({ component: "ws" }));

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
