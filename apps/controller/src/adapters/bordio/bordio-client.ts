import type { Logger } from "@claudeops/logging";
import type {
  BordioClient,
  BordioDefinition,
  BordioTask,
  CreateBordioTaskInput,
  ListTasksOptions,
  ListTasksResult,
  UpdateBordioTaskInput,
} from "../../domain/bordio/client.js";
import { isRetriableBordioStatus, parseBordioErrorBody } from "./errors.js";

const DEFAULT_BASE_URL = "https://api.bordio.com/public/v1";
const MAX_RETRIES = 3;
const RATE_LIMIT_WARN_THRESHOLD = 10;

interface BordioTaskApiShape {
  id: string;
  title: string;
  task_status_id: string;
  task_type_id: string | null;
  tag_ids?: string[];
  project_id?: string | null;
}

function fromApiTask(task: BordioTaskApiShape): BordioTask {
  return {
    id: task.id,
    title: task.title,
    statusId: task.task_status_id,
    typeId: task.task_type_id,
    tagIds: task.tag_ids ?? [],
    projectId: task.project_id ?? null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Real BordioClient (research/bordio.md, decisions/ADR-006.md). Every
 * dependency (API key, base URL, an injectable `fetchImpl` for tests) is
 * a constructor param — lifecycle.ts owns reading it from config
 * (deferred to pageB3, where this client first gets wired in).
 */
export class BordioApiClient implements BordioClient {
  constructor(
    private readonly apiKey: string,
    private readonly logger: Logger,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async listTasks(options: ListTasksOptions = {}): Promise<ListTasksResult> {
    const params = new URLSearchParams();
    if (options.tagIds?.length) {
      params.set("tag_id", options.tagIds.join(","));
    }
    if (options.statusIds?.length) {
      params.set("task_status_id", options.statusIds.join(","));
    }
    if (options.cursor) {
      params.set("cursor", options.cursor);
    }
    const query = params.toString();

    const res = await this.request("GET", `/tasks${query ? `?${query}` : ""}`, undefined, {
      ...(options.ifNoneMatch ? { "If-None-Match": options.ifNoneMatch } : {}),
    });

    if (res.status === 304) {
      return { notModified: true, tasks: [], nextCursor: null, hasMore: false, etag: res.headers.get("ETag") };
    }

    const body = (await res.json()) as { data: BordioTaskApiShape[]; pagination: { next_cursor: string | null; has_more: boolean } };
    return {
      notModified: false,
      tasks: body.data.map(fromApiTask),
      nextCursor: body.pagination.next_cursor,
      hasMore: body.pagination.has_more,
      etag: res.headers.get("ETag"),
    };
  }

  async createTask(input: CreateBordioTaskInput, idempotencyKey: string): Promise<BordioTask> {
    const res = await this.request(
      "POST",
      "/tasks",
      {
        title: input.title,
        ...(input.statusId ? { task_status_id: input.statusId } : {}),
        ...(input.typeId ? { task_type_id: input.typeId } : {}),
        ...(input.tagIds ? { tag_ids: input.tagIds } : {}),
        ...(input.projectId ? { project_id: input.projectId } : {}),
      },
      { "Idempotency-Key": idempotencyKey }
    );
    const body = (await res.json()) as BordioTaskApiShape;
    return fromApiTask(body);
  }

  async updateTask(id: string, input: UpdateBordioTaskInput): Promise<BordioTask> {
    const res = await this.request("PATCH", `/tasks/${encodeURIComponent(id)}`, {
      ...(input.title ? { title: input.title } : {}),
      ...(input.statusId ? { task_status_id: input.statusId } : {}),
      ...(input.tagIds ? { tag_ids: input.tagIds } : {}),
    });
    const body = (await res.json()) as BordioTaskApiShape;
    return fromApiTask(body);
  }

  async listTaskStatusDefinitions(): Promise<BordioDefinition[]> {
    const res = await this.request("GET", "/definitions/task-statuses");
    const body = (await res.json()) as { data: Array<{ id: string; name: string; state: "open" | "closed" }> };
    return body.data.map((d) => ({ id: d.id, name: d.name, state: d.state }));
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {}
  ): Promise<Response> {
    let attempt = 0;
    for (;;) {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...extraHeaders,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      this.warnIfRateLimitLow(res);

      if (res.ok || res.status === 304) {
        return res;
      }

      if (!isRetriableBordioStatus(res.status) || attempt >= MAX_RETRIES) {
        const errorBody = await res.json().catch(() => ({}));
        throw parseBordioErrorBody(res.status, errorBody);
      }

      const retryAfterHeader = res.headers.get("Retry-After");
      const delayMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 2 ** attempt * 500;
      this.logger.warn("retrying Bordio API request", { method, path, status: res.status, attempt, delayMs });
      await sleep(delayMs);
      attempt++;
    }
  }

  private warnIfRateLimitLow(res: Response): void {
    const remaining = res.headers.get("RateLimit-Remaining");
    if (remaining !== null && Number(remaining) < RATE_LIMIT_WARN_THRESHOLD) {
      this.logger.warn("Bordio API rate limit running low", {
        remaining,
        limit: res.headers.get("RateLimit-Limit"),
        reset: res.headers.get("RateLimit-Reset"),
      });
    }
  }
}
