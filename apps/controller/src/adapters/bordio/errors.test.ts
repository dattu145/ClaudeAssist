import { describe, expect, it } from "vitest";
import { BordioApiError, isRetriableBordioStatus, parseBordioErrorBody } from "./errors.js";

describe("parseBordioErrorBody", () => {
  it("parses a full Bordio error envelope", () => {
    const err = parseBordioErrorBody(422, {
      error: {
        type: "validation_error",
        code: "invalid_request",
        message: "due_date must be a valid ISO-8601 datetime",
        request_id: "req_abc123",
      },
    });

    expect(err).toBeInstanceOf(BordioApiError);
    expect(err.status).toBe(422);
    expect(err.type).toBe("validation_error");
    expect(err.code).toBe("invalid_request");
    expect(err.message).toBe("due_date must be a valid ISO-8601 datetime");
    expect(err.requestId).toBe("req_abc123");
  });

  it("falls back to sensible defaults for a malformed/empty body", () => {
    const err = parseBordioErrorBody(500, {});
    expect(err.type).toBe("unknown_error");
    expect(err.code).toBe("unknown");
    expect(err.requestId).toBeNull();
    expect(err.message).toContain("500");
  });
});

describe("isRetriableBordioStatus", () => {
  it("treats 429 as retriable", () => {
    expect(isRetriableBordioStatus(429)).toBe(true);
  });

  it("treats every 5xx as retriable", () => {
    expect(isRetriableBordioStatus(500)).toBe(true);
    expect(isRetriableBordioStatus(503)).toBe(true);
  });

  it("treats 401/403/404/409/422 as non-retriable", () => {
    for (const status of [401, 403, 404, 409, 422]) {
      expect(isRetriableBordioStatus(status)).toBe(false);
    }
  });
});
