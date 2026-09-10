import { Router, type NextFunction, type Request, type Response } from "express";
import { SendInstructionRequestSchema, StartSessionRequestSchema } from "@claudeops/protocol";
import type { SessionRegistry } from "../../domain/session/registry.js";
import type { TaskRegistry } from "../../domain/task/registry.js";
import type { EventRepository } from "../../domain/events/repository.js";
import type { CommandRouter } from "../../domain/command/router.js";

export function createSessionsRouter(
  sessionRegistry: SessionRegistry,
  taskRegistry: TaskRegistry,
  eventRepository: EventRepository,
  commandRouter: CommandRouter
): Router {
  const router = Router();

  router.post("/", (req: Request, res: Response, next: NextFunction) => {
    const parsed = StartSessionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }
    const { projectId, initialInstruction, name } = parsed.data;

    sessionRegistry
      .startSession({ projectId, ...(name !== undefined ? { name } : {}) })
      .then(async (session) => {
        // Always routed through TaskRegistry, even for the very first
        // instruction, so it gets a persisted Task record too (see
        // .claude/plans/page12.md — the gap SessionRegistry.startSession's
        // own initialInstruction param doesn't close on its own).
        if (initialInstruction) {
          await taskRegistry.dispatchInstruction(session.id, initialInstruction);
          return sessionRegistry.getSession(session.id);
        }
        return session;
      })
      .then((session) => res.status(201).json(session))
      .catch((err: unknown) => next(err));
  });

  router.get("/", (req: Request, res: Response, next: NextFunction) => {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    sessionRegistry
      .listSessions(projectId)
      .then((sessions) => res.json(sessions))
      .catch((err: unknown) => next(err));
  });

  router.get("/:id", (req: Request, res: Response, next: NextFunction) => {
    sessionRegistry
      .getSession(req.params.id as string)
      .then((session) => res.json(session))
      .catch((err: unknown) => next(err));
  });

  router.get("/:id/events", (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.params.id as string;
    sessionRegistry
      .getSession(sessionId)
      .then(() => eventRepository.listBySession(sessionId))
      .then((events) => res.json(events))
      .catch((err: unknown) => next(err));
  });

  router.get("/:id/tasks", (req: Request, res: Response, next: NextFunction) => {
    const sessionId = req.params.id as string;
    sessionRegistry
      .getSession(sessionId)
      .then(() => taskRegistry.listTasksForSession(sessionId))
      .then((tasks) => res.json(tasks))
      .catch((err: unknown) => next(err));
  });

  router.post("/:id/instructions", (req: Request, res: Response, next: NextFunction) => {
    const parsed = SendInstructionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }
    commandRouter
      .dispatch({ type: "SEND_INSTRUCTION", sessionId: req.params.id as string, instruction: parsed.data.instruction })
      .then((task) => res.status(201).json(task))
      .catch((err: unknown) => next(err));
  });

  router.post("/:id/resume", (req: Request, res: Response, next: NextFunction) => {
    commandRouter
      .dispatch({ type: "RESUME_SESSION", sessionId: req.params.id as string })
      .then((session) => res.json(session))
      .catch((err: unknown) => next(err));
  });

  router.post("/:id/stop", (req: Request, res: Response, next: NextFunction) => {
    commandRouter
      .dispatch({ type: "STOP_SESSION", sessionId: req.params.id as string })
      .then((session) => res.json(session))
      .catch((err: unknown) => next(err));
  });

  router.post("/:id/cancel", (req: Request, res: Response, next: NextFunction) => {
    commandRouter
      .dispatch({ type: "CANCEL_TASK", sessionId: req.params.id as string })
      .then((task) => res.json(task))
      .catch((err: unknown) => next(err));
  });

  return router;
}
