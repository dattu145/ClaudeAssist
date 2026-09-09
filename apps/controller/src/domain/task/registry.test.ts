import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createLogger } from "@claudeops/logging";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../db/migrate.js";
import { SqliteProjectRepository } from "../../adapters/persistence/sqlite/project-repository.js";
import { SqliteSessionRepository } from "../../adapters/persistence/sqlite/session-repository.js";
import { SqliteTaskRepository } from "../../adapters/persistence/sqlite/task-repository.js";
import { FakeClaudeSessionAdapter } from "../../adapters/fake/fake-claude-session-adapter.js";
import { ProjectRegistry } from "../project/registry.js";
import { SessionRegistry } from "../session/registry.js";
import { InProcessEventBus } from "../events/bus.js";
import { NoCancellableTaskError, SessionNotFoundError, TaskNotFoundError } from "../errors.js";
import { TaskRegistry } from "./registry.js";

describe("TaskRegistry", () => {
  let db: Database.Database;
  let projectDir: string;
  let adapter: FakeClaudeSessionAdapter;
  let sessionRegistry: SessionRegistry;
  let taskRegistry: TaskRegistry;
  let sessionId: string;

  beforeEach(async () => {
    db = new Database(":memory:");
    runMigrations(db);
    projectDir = mkdtempSync(join(tmpdir(), "claudeops-task-registry-"));

    const logger = createLogger({ component: "test" }, { write: () => {} });
    const projectRegistry = new ProjectRegistry(new SqliteProjectRepository(db));
    adapter = new FakeClaudeSessionAdapter(logger);
    sessionRegistry = new SessionRegistry(
      new SqliteSessionRepository(db),
      adapter,
      projectRegistry,
      new InProcessEventBus(logger)
    );
    taskRegistry = new TaskRegistry(new SqliteTaskRepository(db), sessionRegistry, logger);

    const project = await projectRegistry.registerProject({ name: "Website", path: projectDir });
    const session = await sessionRegistry.startSession({ projectId: project.id });
    sessionId = session.id;
  });

  afterEach(() => {
    db.close();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("dispatches an instruction and persists a COMPLETED task on success", async () => {
    const task = await taskRegistry.dispatchInstruction(sessionId, "fix the login bug");

    expect(task.status).toBe("COMPLETED");
    expect(task.instruction).toBe("fix the login bug");
    expect(task.sessionId).toBe(sessionId);
    expect(task.startedAt).not.toBeNull();
    expect(task.completedAt).not.toBeNull();

    const persisted = await taskRegistry.getTask(task.id);
    expect(persisted).toEqual(task);
  });

  it("maps a waiting_for_permission outcome to a WAITING task", async () => {
    adapter.queueInstructionOutcome(sessionId, "waiting_for_permission");

    const task = await taskRegistry.dispatchInstruction(sessionId, "do something risky");

    expect(task.status).toBe("WAITING");
    expect(task.completedAt).toBeNull();
  });

  it("maps a failed outcome to a FAILED task", async () => {
    adapter.queueInstructionOutcome(sessionId, "failed");

    const task = await taskRegistry.dispatchInstruction(sessionId, "break things");

    expect(task.status).toBe("FAILED");
    expect(task.completedAt).not.toBeNull();
  });

  it("throws SessionNotFoundError, and creates no task, for an unknown session", async () => {
    await expect(
      taskRegistry.dispatchInstruction("session_missing", "hi")
    ).rejects.toBeInstanceOf(SessionNotFoundError);

    // getSession (which resolves projectId) is what throws, before any
    // task row is created — nothing to find for this session.
    expect(await taskRegistry.listTasksForSession("session_missing")).toEqual([]);
  });

  it("marks the task FAILED and re-throws when sendInstruction itself throws mid-dispatch", async () => {
    // A session known to the registry's repository but unknown to the
    // adapter (constructed directly, bypassing startSession) reproduces
    // sendInstruction throwing *after* the task was already created.
    const foreignAdapter = new FakeClaudeSessionAdapter(
      createLogger({ component: "test" }, { write: () => {} })
    );
    const foreignSessionRegistry = new SessionRegistry(
      new SqliteSessionRepository(db),
      foreignAdapter,
      new ProjectRegistry(new SqliteProjectRepository(db)),
      new InProcessEventBus(createLogger({ component: "test" }, { write: () => {} }))
    );
    const foreignTaskRegistry = new TaskRegistry(
      new SqliteTaskRepository(db),
      foreignSessionRegistry,
      createLogger({ component: "test" }, { write: () => {} })
    );
    // sessionId exists in the shared SQLite repository (getSession succeeds)
    // but foreignAdapter never started it (sendInstruction throws).
    await expect(
      foreignTaskRegistry.dispatchInstruction(sessionId, "hi")
    ).rejects.toBeInstanceOf(SessionNotFoundError);

    const tasks = await foreignTaskRegistry.listTasksForSession(sessionId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.status).toBe("FAILED");
  });

  it("getTask throws TaskNotFoundError for an unknown task", async () => {
    await expect(taskRegistry.getTask("task_missing")).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it("listTasksForSession returns tasks in creation order", async () => {
    await taskRegistry.dispatchInstruction(sessionId, "first");
    await taskRegistry.dispatchInstruction(sessionId, "second");

    const tasks = await taskRegistry.listTasksForSession(sessionId);

    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.instruction)).toEqual(["first", "second"]);
  });

  it("cancelTask transitions a WAITING task to CANCELLED", async () => {
    adapter.queueInstructionOutcome(sessionId, "waiting_for_permission");
    const task = await taskRegistry.dispatchInstruction(sessionId, "risky");

    const cancelled = await taskRegistry.cancelTask(task.id);

    expect(cancelled.status).toBe("CANCELLED");
  });

  it("cancelTask on an already-COMPLETED task is a no-op (invalid transition)", async () => {
    const task = await taskRegistry.dispatchInstruction(sessionId, "fix it");

    const result = await taskRegistry.cancelTask(task.id);

    expect(result.status).toBe("COMPLETED");
  });

  describe("cancelLatestTaskForSession", () => {
    it("cancels the most recent cancellable task", async () => {
      await taskRegistry.dispatchInstruction(sessionId, "first, completes");
      adapter.queueInstructionOutcome(sessionId, "waiting_for_permission");
      const waiting = await taskRegistry.dispatchInstruction(sessionId, "second, waits");

      const cancelled = await taskRegistry.cancelLatestTaskForSession(sessionId);

      expect(cancelled.id).toBe(waiting.id);
      expect(cancelled.status).toBe("CANCELLED");
    });

    it("throws NoCancellableTaskError when no task is cancellable", async () => {
      await taskRegistry.dispatchInstruction(sessionId, "already completed");

      await expect(taskRegistry.cancelLatestTaskForSession(sessionId)).rejects.toBeInstanceOf(
        NoCancellableTaskError
      );
    });

    it("throws NoCancellableTaskError when the session has no tasks at all", async () => {
      await expect(taskRegistry.cancelLatestTaskForSession(sessionId)).rejects.toBeInstanceOf(
        NoCancellableTaskError
      );
    });

    it("throws SessionNotFoundError for an unknown session", async () => {
      await expect(
        taskRegistry.cancelLatestTaskForSession("session_missing")
      ).rejects.toBeInstanceOf(SessionNotFoundError);
    });
  });
});
