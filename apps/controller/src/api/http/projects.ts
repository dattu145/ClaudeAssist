import { Router, type NextFunction, type Request, type Response } from "express";
import { CreateProjectRequestSchema } from "@claudeops/protocol";
import type { ProjectRegistry } from "../../domain/project/registry.js";

export function createProjectsRouter(registry: ProjectRegistry): Router {
  const router = Router();

  router.post("/", (req: Request, res: Response, next: NextFunction) => {
    const parsed = CreateProjectRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }

    registry
      .registerProject(parsed.data)
      .then((project) => res.status(201).json(project))
      .catch((err: unknown) => next(err));
  });

  router.get("/", (_req: Request, res: Response, next: NextFunction) => {
    registry
      .listProjects()
      .then((projects) => res.json(projects))
      .catch((err: unknown) => next(err));
  });

  router.get("/:id", (req: Request, res: Response, next: NextFunction) => {
    registry
      .getProject(req.params.id as string)
      .then((project) => res.json(project))
      .catch((err: unknown) => next(err));
  });

  return router;
}
