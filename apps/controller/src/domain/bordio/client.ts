/**
 * The Bordio integration port (research/bordio.md, decisions/ADR-006.md).
 * Distinct from ClaudeSessionAdapter (page7) but the same shape of
 * decision: define the interface against a fake before any real caller
 * exists, so pageB3 (outbound NotificationService) and pageB4 (inbound
 * polling) can be built and tested without a real BORDIO_API_KEY.
 */

export interface BordioTask {
  id: string;
  title: string;
  statusId: string;
  typeId: string | null;
  tagIds: string[];
  projectId: string | null;
}

export interface CreateBordioTaskInput {
  title: string;
  statusId?: string;
  typeId?: string;
  tagIds?: string[];
  projectId?: string;
}

export interface UpdateBordioTaskInput {
  title?: string;
  statusId?: string;
}

export interface ListTasksOptions {
  tagIds?: string[];
  statusIds?: string[];
  cursor?: string;
  /** Sent as If-None-Match (research/bordio.md: all GET endpoints
   * support conditional requests). No caching layer exists yet — this
   * just exposes the capability for pageB2/B4 to use. */
  ifNoneMatch?: string;
}

export interface ListTasksResult {
  /** true on a real 304 — `tasks` is empty in that case. */
  notModified: boolean;
  tasks: BordioTask[];
  nextCursor: string | null;
  hasMore: boolean;
  etag: string | null;
}

export interface BordioDefinition {
  id: string;
  name: string;
  state: "open" | "closed";
}

export interface BordioClient {
  listTasks(options?: ListTasksOptions): Promise<ListTasksResult>;
  /**
   * `idempotencyKey` is caller-supplied, never invented here — the
   * caller (pageB3) derives it from the ClaudeOps entity being mirrored
   * so a crash-and-retry can't double-create a Bordio task.
   */
  createTask(input: CreateBordioTaskInput, idempotencyKey: string): Promise<BordioTask>;
  updateTask(id: string, input: UpdateBordioTaskInput): Promise<BordioTask>;
  listTaskStatusDefinitions(): Promise<BordioDefinition[]>;
}
