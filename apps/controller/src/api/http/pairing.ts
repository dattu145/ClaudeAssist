import { Router, type NextFunction, type Request, type Response } from "express";
import { ExchangePairingCodeRequestSchema } from "@claudeops/protocol";
import type { PairingRegistry } from "../../domain/pairing/registry.js";
import { createAuthMiddleware } from "./auth-middleware.js";

export function createPairingRouter(pairingRegistry: PairingRegistry): Router {
  const router = Router();

  router.post("/exchange", (req: Request, res: Response, next: NextFunction) => {
    const parsed = ExchangePairingCodeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", issues: parsed.error.issues });
      return;
    }
    pairingRegistry
      .exchangeCode(parsed.data.code)
      .then((issued) => res.status(201).json(issued))
      .catch((err: unknown) => next(err));
  });

  router.post(
    "/revoke",
    createAuthMiddleware(pairingRegistry),
    (req: Request, res: Response, next: NextFunction) => {
      const header = req.headers.authorization as string;
      const token = header.slice("Bearer ".length);
      pairingRegistry
        .revokeToken(token)
        .then(() => res.status(204).end())
        .catch((err: unknown) => next(err));
    }
  );

  return router;
}
