/**
 * Bordio's real error envelope (research/bordio.md):
 * { "error": { "type", "code", "message", "request_id", "errors"?, "details"? } }
 * Adapter-level, not a DomainError — this represents an external API
 * failure, not a domain rule violation.
 */
export interface BordioErrorBody {
  error?: {
    type?: string;
    code?: string;
    message?: string;
    request_id?: string;
    errors?: Array<{ field?: string; message?: string }>;
    details?: unknown;
  };
}

export class BordioApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly type: string,
    public readonly code: string,
    public readonly requestId: string | null
  ) {
    super(message);
    this.name = "BordioApiError";
  }
}

/** research/bordio.md's Errors section: 429 and 500 are retriable,
 * everything else (401/403/404/409/422) is not. */
export function isRetriableBordioStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function parseBordioErrorBody(status: number, body: unknown): BordioApiError {
  const parsed = body as BordioErrorBody;
  const error = parsed?.error;
  return new BordioApiError(
    error?.message ?? `Bordio API request failed with status ${status}`,
    status,
    error?.type ?? "unknown_error",
    error?.code ?? "unknown",
    error?.request_id ?? null
  );
}
