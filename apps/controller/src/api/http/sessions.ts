import { Router, type NextFunction, type Request, type Response } from "express";
import type { SessionRegistry } from "../../domain/session/registry.js";
import type { EventRepository } from "../../domain/events/repository.js";

/**
 * Only GET /sessions/:id/events lands here (page10, per MASTER_PLAN.md —
 * the rest of /sessions* is page12, deliberately not built early).
 */
export function createSessionsRouter(
  sessionRegistry: SessionRegistry,
  eventRepository: EventRepository
): Router {
  const router = Router();

  router.get("/:id/events", (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.params.id as string;
    sessionRegistry
      .getSession(sessionId)
      .then(() => eventRepository.listBySession(sessionId))
      .then((events) => res.json(events))
      .catch((err: unknown) => next(err));
  });

  return router;
}
