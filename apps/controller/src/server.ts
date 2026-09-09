import { randomUUID } from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Logger } from "@claudeops/logging";
import { getHealth, type HealthDeps } from "./health.js";
import { DomainError, domainErrorHttpStatus } from "./domain/errors.js";
import { createProjectsRouter } from "./api/http/projects.js";
import type { ProjectRegistry } from "./domain/project/registry.js";

export interface AppDeps extends HealthDeps {
  logger: Logger;
  projectRegistry: ProjectRegistry;
}

declare module "express-serve-static-core" {
  interface Request {
    requestId: string;
    logger: Logger;
  }
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.requestId = randomUUID();
    req.logger = deps.logger.child({ requestId: req.requestId, event: `${req.method} ${req.path}` });
    req.logger.info("request received");
    next();
  });

  app.get("/health", (_req: Request, res: Response, next: NextFunction) => {
    getHealth(deps)
      .then((health) => res.json(health))
      .catch((err: unknown) => next(err));
  });

  app.use("/projects", createProjectsRouter(deps.projectRegistry));

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: "not_found", path: req.path });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      req.logger.warn("request failed with domain error", { error: err.code });
      res.status(domainErrorHttpStatus(err)).json({ error: err.code, message: err.message });
      return;
    }

    req.logger.error("unhandled request error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
