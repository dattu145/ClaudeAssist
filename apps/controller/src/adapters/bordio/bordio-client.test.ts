import { createLogger } from "@claudeops/logging";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BordioApiError } from "./errors.js";
import { BordioApiClient } from "./bordio-client.js";

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null,
    },
    json: async () => body,
  } as unknown as Response;
}

describe("BordioApiClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a bearer auth header on every request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [], pagination: { next_cursor: null, has_more: false } })
    );
    const client = new BordioApiClient("brd_sk_live_test", silentLogger(), "https://api.example", fetchImpl);

    await client.listTasks();

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer brd_sk_live_test");
  });

  it("maps a task list response, including pagination", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: [{ id: "task_1", title: "Do it", task_status_id: "status_todo", task_type_id: null, tag_ids: ["tag_x"] }],
        pagination: { next_cursor: "cursor_2", has_more: true },
      })
    );
    const client = new BordioApiClient("k", silentLogger(), "https://api.example", fetchImpl);

    const result = await client.listTasks();

    expect(result.notModified).toBe(false);
    expect(result.tasks).toEqual([
      { id: "task_1", title: "Do it", statusId: "status_todo", typeId: null, tagIds: ["tag_x"], projectId: null },
    ]);
    expect(result.nextCursor).toBe("cursor_2");
    expect(result.hasMore).toBe(true);
  });

  it("returns notModified with empty tasks on a real 304", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(304, undefined, { ETag: '"abc"' }));
    const client = new BordioApiClient("k", silentLogger(), "https://api.example", fetchImpl);

    const result = await client.listTasks({ ifNoneMatch: '"abc"' });

    expect(result.notModified).toBe(true);
    expect(result.tasks).toEqual([]);
    expect(result.etag).toBe('"abc"');

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["If-None-Match"]).toBe('"abc"');
  });

  it("sends the Idempotency-Key header and maps the created task", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(201, { id: "task_new", title: "New", task_status_id: "status_todo", task_type_id: null }));
    const client = new BordioApiClient("k", silentLogger(), "https://api.example", fetchImpl);

    const task = await client.createTask({ title: "New" }, "idem-key-1");

    expect(task.id).toBe("task_new");
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-key-1");
    expect(init.method).toBe("POST");
  });

  it("PATCHes on updateTask", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { id: "task_1", title: "Renamed", task_status_id: "status_done", task_type_id: null }));
    const client = new BordioApiClient("k", silentLogger(), "https://api.example", fetchImpl);

    const task = await client.updateTask("task_1", { title: "Renamed", statusId: "status_done" });

    expect(task.title).toBe("Renamed");
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
  });

  it("retries a 429, honoring Retry-After, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: { type: "rate_limit_error", code: "too_many_requests" } }, { "Retry-After": "1" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], pagination: { next_cursor: null, has_more: false } }));
    const client = new BordioApiClient("k", silentLogger(), "https://api.example", fetchImpl);

    const resultPromise = client.listTasks();
    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result.notModified).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a 500 with backoff, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { error: { type: "api_error", code: "internal_error" } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], pagination: { next_cursor: null, has_more: false } }));
    const client = new BordioApiClient("k", silentLogger(), "https://api.example", fetchImpl);

    const resultPromise = client.listTasks();
    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result.notModified).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on a persistent 500", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, { error: { type: "api_error", code: "internal_error" } }));
    const client = new BordioApiClient("k", silentLogger(), "https://api.example", fetchImpl);

    const resultPromise = client.listTasks().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await resultPromise;

    expect(error).toBeInstanceOf(BordioApiError);
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
  });

  it("does not retry a non-retriable 4xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(422, { error: { type: "validation_error", code: "invalid_request", message: "bad input" } }));
    const client = new BordioApiClient("k", silentLogger(), "https://api.example", fetchImpl);

    await expect(client.listTasks()).rejects.toMatchObject({ status: 422, code: "invalid_request" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("warns but does not throw when RateLimit-Remaining is low", async () => {
    const lines: string[] = [];
    const logger = createLogger({ component: "test" }, { write: (l) => lines.push(l) });
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        200,
        { data: [], pagination: { next_cursor: null, has_more: false } },
        { "RateLimit-Remaining": "3", "RateLimit-Limit": "120" }
      )
    );
    const client = new BordioApiClient("k", logger, "https://api.example", fetchImpl);

    await client.listTasks();

    expect(lines.some((l) => l.includes("rate limit running low"))).toBe(true);
  });

  it("never logs the raw API key", async () => {
    const lines: string[] = [];
    const logger = createLogger({ component: "test" }, { write: (l) => lines.push(l) });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: { type: "rate_limit_error", code: "too_many_requests" } }, { "Retry-After": "0" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], pagination: { next_cursor: null, has_more: false } }));
    const client = new BordioApiClient("brd_sk_live_super_secret", logger, "https://api.example", fetchImpl);

    const resultPromise = client.listTasks();
    await vi.advanceTimersByTimeAsync(10_000);
    await resultPromise;

    expect(lines.every((l) => !l.includes("brd_sk_live_super_secret"))).toBe(true);
  });
});
