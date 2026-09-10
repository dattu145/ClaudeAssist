import {
  ClaudeSessionSchema,
  CreateProjectRequestSchema,
  DomainEventSchema,
  ProjectSchema,
  SendInstructionRequestSchema,
  StartSessionRequestSchema,
  TaskSchema,
  type ClaudeSession,
  type CreateProjectRequest,
  type DomainEvent,
  type Project,
  type StartSessionRequest,
  type Task,
} from "@claudeops/protocol";
import { z } from "zod";

/**
 * Every request body is validated against the same Zod schemas the
 * controller itself uses before it's sent, and every response is validated
 * before it's handed back — the controller is a network peer, not a
 * trusted process, so its JSON gets the same scrutiny user input would.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  error?: string;
  message?: string;
}

async function request<T>(
  baseUrl: string,
  token: string,
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("Could not reach the controller.", 0);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(body.message ?? body.error ?? `Request failed (${res.status}).`, res.status);
  }

  const json = await res.json().catch(() => undefined);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("The controller returned an unexpected response.", res.status);
  }
  return parsed.data;
}

function body(data: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(data) };
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  listProjects(): Promise<Project[]> {
    return request(this.baseUrl, this.token, "/projects", z.array(ProjectSchema));
  }

  getProject(id: string): Promise<Project> {
    return request(this.baseUrl, this.token, `/projects/${encodeURIComponent(id)}`, ProjectSchema);
  }

  createProject(req: CreateProjectRequest): Promise<Project> {
    const parsed = CreateProjectRequestSchema.parse(req);
    return request(this.baseUrl, this.token, "/projects", ProjectSchema, body(parsed));
  }

  listSessions(projectId?: string): Promise<ClaudeSession[]> {
    const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    return request(this.baseUrl, this.token, `/sessions${qs}`, z.array(ClaudeSessionSchema));
  }

  getSession(id: string): Promise<ClaudeSession> {
    return request(this.baseUrl, this.token, `/sessions/${encodeURIComponent(id)}`, ClaudeSessionSchema);
  }

  startSession(req: StartSessionRequest): Promise<ClaudeSession> {
    const parsed = StartSessionRequestSchema.parse(req);
    return request(this.baseUrl, this.token, "/sessions", ClaudeSessionSchema, body(parsed));
  }

  sendInstruction(sessionId: string, instruction: string): Promise<Task> {
    const parsed = SendInstructionRequestSchema.parse({ instruction });
    return request(
      this.baseUrl,
      this.token,
      `/sessions/${encodeURIComponent(sessionId)}/instructions`,
      TaskSchema,
      body(parsed)
    );
  }

  resumeSession(id: string): Promise<ClaudeSession> {
    return request(this.baseUrl, this.token, `/sessions/${encodeURIComponent(id)}/resume`, ClaudeSessionSchema, {
      method: "POST",
    });
  }

  stopSession(id: string): Promise<ClaudeSession> {
    return request(this.baseUrl, this.token, `/sessions/${encodeURIComponent(id)}/stop`, ClaudeSessionSchema, {
      method: "POST",
    });
  }

  cancelLatestTask(sessionId: string): Promise<Task> {
    return request(this.baseUrl, this.token, `/sessions/${encodeURIComponent(sessionId)}/cancel`, TaskSchema, {
      method: "POST",
    });
  }

  listSessionTasks(sessionId: string): Promise<Task[]> {
    return request(
      this.baseUrl,
      this.token,
      `/sessions/${encodeURIComponent(sessionId)}/tasks`,
      z.array(TaskSchema)
    );
  }

  listSessionEvents(sessionId: string): Promise<DomainEvent[]> {
    return request(
      this.baseUrl,
      this.token,
      `/sessions/${encodeURIComponent(sessionId)}/events`,
      z.array(DomainEventSchema)
    );
  }
}
