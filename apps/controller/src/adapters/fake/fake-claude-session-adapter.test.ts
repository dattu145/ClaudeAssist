import { createLogger } from "@claudeops/logging";
import { beforeEach, describe, expect, it } from "vitest";
import { SessionNotFoundError } from "../../domain/errors.js";
import type { SessionAdapterEvent } from "../../domain/session/adapter.js";
import { FakeClaudeSessionAdapter } from "./fake-claude-session-adapter.js";

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

describe("FakeClaudeSessionAdapter", () => {
  let adapter: FakeClaudeSessionAdapter;

  beforeEach(() => {
    adapter = new FakeClaudeSessionAdapter(silentLogger());
  });

  it("startSession without an initial instruction lands in IDLE", async () => {
    const session = await adapter.startSession({
      projectId: "project_1",
      projectPath: "/x",
    });

    expect(session.status).toBe("IDLE");
    expect(await adapter.getStatus(session.id)).toBe("IDLE");
  });

  it("startSession with an initial instruction runs it and defaults to COMPLETED", async () => {
    const session = await adapter.startSession({
      projectId: "project_1",
      projectPath: "/x",
      initialInstruction: "say hello",
    });

    expect(session.status).toBe("COMPLETED");
  });

  it("sendInstruction on an idle session runs through WORKING to COMPLETED by default", async () => {
    const started = await adapter.startSession({ projectId: "project_1", projectPath: "/x" });

    const result = await adapter.sendInstruction(started.id, "do the thing");

    expect(result.status).toBe("completed");
    expect(result.output).toContain("do the thing");
    expect(await adapter.getStatus(started.id)).toBe("COMPLETED");
  });

  it("honors a queued outcome for the next instruction only (one-shot)", async () => {
    const started = await adapter.startSession({ projectId: "project_1", projectPath: "/x" });
    adapter.queueInstructionOutcome(started.id, "waiting_for_permission");

    const first = await adapter.sendInstruction(started.id, "risky thing");
    expect(first.status).toBe("waiting_for_permission");
    expect(await adapter.getStatus(started.id)).toBe("WAITING_FOR_PERMISSION");

    const second = await adapter.sendInstruction(started.id, "continue");
    expect(second.status).toBe("completed");
  });

  it("a failed outcome surfaces an error and transitions to FAILED", async () => {
    const started = await adapter.startSession({ projectId: "project_1", projectPath: "/x" });
    adapter.queueInstructionOutcome(started.id, "failed");

    const result = await adapter.sendInstruction(started.id, "break things");

    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
    expect(await adapter.getStatus(started.id)).toBe("FAILED");
  });

  it("stopSession transitions to STOPPED and emits a stopped event", async () => {
    const started = await adapter.startSession({ projectId: "project_1", projectPath: "/x" });
    const events: SessionAdapterEvent[] = [];
    adapter.subscribe(started.id, (e) => events.push(e));

    await adapter.stopSession(started.id);

    expect(await adapter.getStatus(started.id)).toBe("STOPPED");
    expect(events.some((e) => e.type === "stopped")).toBe(true);
  });

  it("resumeSession brings a stopped session back to WORKING", async () => {
    const started = await adapter.startSession({ projectId: "project_1", projectPath: "/x" });
    await adapter.stopSession(started.id);

    const resumed = await adapter.resumeSession(started.id);

    expect(resumed.status).toBe("WORKING");
  });

  it("discoverSessions reflects every started session", async () => {
    const a = await adapter.startSession({ projectId: "project_1", projectPath: "/x" });
    const b = await adapter.startSession({ projectId: "project_2", projectPath: "/y" });

    const discovered = await adapter.discoverSessions();

    expect(discovered.map((s) => s.claudeSessionId).sort()).toEqual(
      [a.claudeSessionId ?? a.id, b.claudeSessionId ?? b.id].sort()
    );
  });

  it("getStatus throws SessionNotFoundError for an unknown session", async () => {
    await expect(adapter.getStatus("session_missing")).rejects.toBeInstanceOf(
      SessionNotFoundError
    );
  });

  it("getSession returns the full current record", async () => {
    const started = await adapter.startSession({ projectId: "project_1", projectPath: "/x" });

    const session = await adapter.getSession(started.id);

    expect(session).toEqual(started);
  });

  it("getSession throws SessionNotFoundError for an unknown session", async () => {
    await expect(adapter.getSession("session_missing")).rejects.toBeInstanceOf(
      SessionNotFoundError
    );
  });

  it("sendInstruction throws SessionNotFoundError for an unknown session", async () => {
    await expect(adapter.sendInstruction("session_missing", "hi")).rejects.toBeInstanceOf(
      SessionNotFoundError
    );
  });

  it("delivers status_changed and output events during a run", async () => {
    const started = await adapter.startSession({ projectId: "project_1", projectPath: "/x" });
    const events: SessionAdapterEvent[] = [];
    adapter.subscribe(started.id, (e) => events.push(e));

    await adapter.sendInstruction(started.id, "do it");

    expect(events.some((e) => e.type === "status_changed")).toBe(true);
    expect(events.some((e) => e.type === "output")).toBe(true);
    expect(events.some((e) => e.type === "completed")).toBe(true);
  });

  it("stops delivering events after unsubscribe", async () => {
    const started = await adapter.startSession({ projectId: "project_1", projectPath: "/x" });
    const events: SessionAdapterEvent[] = [];
    const unsubscribe = adapter.subscribe(started.id, (e) => events.push(e));
    unsubscribe();

    await adapter.sendInstruction(started.id, "do it");

    expect(events).toHaveLength(0);
  });
});
