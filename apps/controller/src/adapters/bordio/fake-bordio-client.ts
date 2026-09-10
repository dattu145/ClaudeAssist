import type {
  BordioClient,
  BordioDefinition,
  BordioTask,
  CreateBordioTaskInput,
  ListTasksOptions,
  ListTasksResult,
  UpdateBordioTaskInput,
} from "../../domain/bordio/client.js";
import { BordioApiError } from "./errors.js";

interface IdempotencyRecord {
  bodyHash: string;
  task: BordioTask;
}

/**
 * Deterministic, in-memory BordioClient for tests (mirrors
 * FakeClaudeSessionAdapter's role — page7). Enforces the same
 * idempotency-key semantics real Bordio documents (research/bordio.md):
 * same key + same body replays the original result; same key + different
 * body is a 409 conflict.
 */
export class FakeBordioClient implements BordioClient {
  private readonly tasks = new Map<string, BordioTask>();
  private readonly idempotencyKeys = new Map<string, IdempotencyRecord>();
  private nextId = 1;

  readonly statusDefinitions: BordioDefinition[] = [
    { id: "status_todo", name: "To do", state: "open" },
    { id: "status_in_progress", name: "In progress", state: "open" },
    { id: "status_done", name: "Done", state: "closed" },
  ];

  /** Test-only hook, not part of the BordioClient port: inserts a task
   * exactly as given (pageB5's recovery test uses this to stand in for
   * "the real Bordio task still exists remotely" across a simulated
   * restart, where instance B's fake client is a brand-new instance). */
  seedTask(task: BordioTask): void {
    this.tasks.set(task.id, task);
  }

  async listTasks(options: ListTasksOptions = {}): Promise<ListTasksResult> {
    let tasks = [...this.tasks.values()];
    if (options.tagIds?.length) {
      tasks = tasks.filter((t) => t.tagIds.some((id) => options.tagIds?.includes(id)));
    }
    if (options.statusIds?.length) {
      tasks = tasks.filter((t) => options.statusIds?.includes(t.statusId));
    }

    const etag = `"fake-${tasks.map((t) => t.id).join(",")}"`;
    if (options.ifNoneMatch && options.ifNoneMatch === etag) {
      return { notModified: true, tasks: [], nextCursor: null, hasMore: false, etag };
    }

    return { notModified: false, tasks, nextCursor: null, hasMore: false, etag };
  }

  async createTask(input: CreateBordioTaskInput, idempotencyKey: string): Promise<BordioTask> {
    const bodyHash = JSON.stringify(input);
    const existing = this.idempotencyKeys.get(idempotencyKey);
    if (existing) {
      if (existing.bodyHash !== bodyHash) {
        throw new BordioApiError(
          "Idempotency-Key already used with a different request body",
          409,
          "conflict_error",
          "already_exists",
          null
        );
      }
      return existing.task;
    }

    const task: BordioTask = {
      id: `task_fake_${this.nextId++}`,
      title: input.title,
      statusId: input.statusId ?? this.statusDefinitions[0]!.id,
      typeId: input.typeId ?? null,
      tagIds: input.tagIds ?? [],
      projectId: input.projectId ?? null,
    };
    this.tasks.set(task.id, task);
    this.idempotencyKeys.set(idempotencyKey, { bodyHash, task });
    return task;
  }

  async updateTask(id: string, input: UpdateBordioTaskInput): Promise<BordioTask> {
    const existing = this.tasks.get(id);
    if (!existing) {
      throw new BordioApiError(`Task ${id} not found`, 404, "not_found_error", "resource_not_found", null);
    }
    const updated: BordioTask = { ...existing, ...input };
    this.tasks.set(id, updated);
    return updated;
  }

  async listTaskStatusDefinitions(): Promise<BordioDefinition[]> {
    return this.statusDefinitions;
  }
}
