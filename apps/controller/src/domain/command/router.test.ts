import { describe, expect, it } from "vitest";
import type { ClaudeSession, Task } from "@claudeops/protocol";
import type { SessionRegistry } from "../session/registry.js";
import type { TaskRegistry } from "../task/registry.js";
import { CommandRouter } from "./router.js";

function fakeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    id: "session_1",
    projectId: "project_1",
    claudeSessionId: null,
    status: "IDLE",
    currentTask: null,
    processId: null,
    terminalId: null,
    lastOutput: null,
    lastError: null,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task_1",
    projectId: "project_1",
    sessionId: "session_1",
    instruction: "do it",
    status: "QUEUED",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("CommandRouter", () => {
  it("dispatches SEND_INSTRUCTION to taskRegistry.dispatchInstruction", async () => {
    const calls: Array<[string, string]> = [];
    const task = fakeTask();
    const taskRegistry = {
      dispatchInstruction: (sessionId: string, instruction: string) => {
        calls.push([sessionId, instruction]);
        return Promise.resolve(task);
      },
    } as unknown as TaskRegistry;
    const router = new CommandRouter({} as SessionRegistry, taskRegistry);

    const result = await router.dispatch({ type: "SEND_INSTRUCTION", sessionId: "session_1", instruction: "go" });

    expect(calls).toEqual([["session_1", "go"]]);
    expect(result).toBe(task);
  });

  it("dispatches RESUME_SESSION to sessionRegistry.resumeSession", async () => {
    const calls: string[] = [];
    const session = fakeSession({ status: "WORKING" });
    const sessionRegistry = {
      resumeSession: (sessionId: string) => {
        calls.push(sessionId);
        return Promise.resolve(session);
      },
    } as unknown as SessionRegistry;
    const router = new CommandRouter(sessionRegistry, {} as TaskRegistry);

    const result = await router.dispatch({ type: "RESUME_SESSION", sessionId: "session_1" });

    expect(calls).toEqual(["session_1"]);
    expect(result).toBe(session);
  });

  it("dispatches STOP_SESSION to sessionRegistry.stopSession then re-fetches the session", async () => {
    const stopCalls: string[] = [];
    const getCalls: string[] = [];
    const stoppedSession = fakeSession({ status: "STOPPED" });
    const sessionRegistry = {
      stopSession: (sessionId: string) => {
        stopCalls.push(sessionId);
        return Promise.resolve();
      },
      getSession: (sessionId: string) => {
        getCalls.push(sessionId);
        return Promise.resolve(stoppedSession);
      },
    } as unknown as SessionRegistry;
    const router = new CommandRouter(sessionRegistry, {} as TaskRegistry);

    const result = await router.dispatch({ type: "STOP_SESSION", sessionId: "session_1" });

    expect(stopCalls).toEqual(["session_1"]);
    expect(getCalls).toEqual(["session_1"]);
    expect(result).toBe(stoppedSession);
  });

  it("dispatches CANCEL_TASK to taskRegistry.cancelLatestTaskForSession", async () => {
    const calls: string[] = [];
    const cancelledTask = fakeTask({ status: "CANCELLED" });
    const taskRegistry = {
      cancelLatestTaskForSession: (sessionId: string) => {
        calls.push(sessionId);
        return Promise.resolve(cancelledTask);
      },
    } as unknown as TaskRegistry;
    const router = new CommandRouter({} as SessionRegistry, taskRegistry);

    const result = await router.dispatch({ type: "CANCEL_TASK", sessionId: "session_1" });

    expect(calls).toEqual(["session_1"]);
    expect(result).toBe(cancelledTask);
  });
});
