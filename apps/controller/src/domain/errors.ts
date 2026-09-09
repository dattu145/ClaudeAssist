/**
 * Base for every domain error. `code` drives generic HTTP-status mapping in
 * server.ts (see .claude/plans/page6.md) so adding a new error type never
 * requires touching the HTTP layer: *_NOT_FOUND -> 404, INVALID_* -> 400,
 * anything else -> 500.
 *
 * Other error types from the spec's ERROR HANDLING list
 * (SessionNotReadyError, ClaudeCodeUnavailableError,
 * InstructionDispatchError, PermissionRequiredError, PairingError,
 * UnsupportedOperationError) are added when the page that needs them lands,
 * not speculatively here.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
}

export class ProjectNotFoundError extends DomainError {
  readonly code = "PROJECT_NOT_FOUND";

  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = "ProjectNotFoundError";
  }
}

export class SessionNotFoundError extends DomainError {
  readonly code = "SESSION_NOT_FOUND";

  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

export function domainErrorHttpStatus(error: DomainError): number {
  if (error.code.endsWith("_NOT_FOUND")) {
    return 404;
  }
  if (error.code.startsWith("INVALID_")) {
    return 400;
  }
  return 500;
}
