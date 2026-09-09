import type { NextFunction, Request, Response } from "express";
import type { PairingRegistry } from "../../domain/pairing/registry.js";

/**
 * Plain Express middleware, not routed through the DomainError mapping:
 * 401 is a cross-cutting transport concern, not a domain not-found/
 * invalid-input case the existing *_NOT_FOUND/INVALID_* scheme fits.
 */
export function createAuthMiddleware(pairingRegistry: PairingRegistry) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

    if (!token) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "missing bearer token" });
      return;
    }

    pairingRegistry
      .verifyToken(token)
      .then((valid) => {
        if (!valid) {
          res.status(401).json({ error: "UNAUTHORIZED", message: "invalid or revoked token" });
          return;
        }
        next();
      })
      .catch((err: unknown) => next(err));
  };
}
