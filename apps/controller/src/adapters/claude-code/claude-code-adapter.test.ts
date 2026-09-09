import { createLogger } from "@claudeops/logging";
import { describe, expect, it, vi } from "vitest";
import { SessionNotFoundError } from "../../domain/errors.js";
import type { SessionAdapterEvent } from "../../domain/session/adapter.js";
import { ClaudeCodeAdapter } from "./claude-code-adapter.js";
import type { ClaudeCliProcess, ClaudeCliResult, RunClaudeCli } from "./cli.js";

function silentLogger() {
  return createLogger({ component: "test" }, { write: () => {} });
}

function streamJsonFor(opts: {
  sessionId: string;
  text: string;
  isError?: boolean;
  permissionDenials?: unknown[];
}): string {
  const lines = [
    JSON.stringify({ type: "system", subtype: "init", session_id: opts.sessionId, cwd: "/x" }),
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: opts.text }] },
      session_id: opts.sessionId,
    }),
    JSON.stringify({
      type: "result",
      subtype: opts.isError ? "error_during_execution" : "success",
      is_error: opts.isError ?? false,
      result: opts.text,
      session_id: opts.sessionId,
      permission_denials: opts.permissionDenials ?? [],
    }),
  ];
  return lines.join("\n") + "\n";
}

/** Scripted RunClaudeCli test double: canned responses keyed by call order. */
function makeScriptedRunCli(responses: ClaudeCliResult[]): { runCli: RunClaudeCli; calls: string[][] } {
  const calls: string[][] = [];
  let i = 0;
  const runCli: RunClaudeCli = (args) => {
    calls.push(args);
    const response = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (!response) {
      throw new Error("makeScriptedRunCli: no response configured for this call");
    }
    return { result: Promise.resolve(response), kill: vi.fn() };
  };
  return { runCli, calls };
}

function makeControllableRunCli() {
  let resolveFn!: (r: ClaudeCliResult) => void;
  let killed = false;
  const pending = new Promise<ClaudeCliResult>((resolve) => {
    resolveFn = resolve;
  });
  const runCli: RunClaudeCli = (): ClaudeCliProcess => ({
    result: pending,
    kill: () => {
      killed = true;
      resolveFn({ stdout: "", stderr: "", exitCode: null });
    },
  });
  return { runCli, wasKilled: () => killed };
}

describe("ClaudeCodeAdapter", () => {
  it("startSession without an initial instruction lands in IDLE, spawning nothing", async () => {
    const { runCli, calls } = makeScriptedRunCli([]);
    const adapter = new ClaudeCodeAdapter(silentLogger(), runCli);

    const session = await adapter.startSession({ projectId: "p1", projectPath: "/x" });

    expect(session.status).toBe("IDLE");
    expect(session.claudeSessionId).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("startSession with an initial instruction dispatches it, using --session-id on the first call", async () => {
    const claudeSessionId = "0de8110c-5079-4cd8-8244-e2493dfc2b5e";
    const { runCli, calls } = makeScriptedRunCli([
      { stdout: streamJsonFor({ sessionId: claudeSessionId, text: "OK" }), stderr: "", exitCode: 0 },
    ]);
    const adapter = new ClaudeCodeAdapter(silentLogger(), runCli);

    const session = await adapter.startSession({
      projectId: "p1",
      projectPath: "/x",
      initialInstruction: "say hi",
    });

    expect(session.status).toBe("COMPLETED");
    expect(session.claudeSessionId).toBe(claudeSessionId);
    expect(calls[0]).toContain("--session-id");
    expect(calls[0]).not.toContain("--resume");
    expect(calls[0]).toContain("--verbose");
    expect(calls[0]).toContain("stream-json");
  });

  it("sendInstruction on a session with a known claudeSessionId uses --resume", async () => {
    const claudeSessionId = "0de8110c-5079-4cd8-8244-e2493dfc2b5e";
    const { runCli, calls } = makeScriptedRunCli([
      { stdout: streamJsonFor({ sessionId: claudeSessionId, text: "first" }), stderr: "", exitCode: 0 },
      { stdout: streamJsonFor({ sessionId: claudeSessionId, text: "second" }), stderr: "", exitCode: 0 },
    ]);
    const adapter = new ClaudeCodeAdapter(silentLogger(), runCli);

    const session = await adapter.startSession({
      projectId: "p1",
      projectPath: "/x",
      initialInstruction: "first message",
    });
    const result = await adapter.sendInstruction(session.id, "second message");

    expect(result.status).toBe("completed");
    expect(result.output).toBe("second");
    expect(calls[1]).toContain("--resume");
    expect(calls[1]).toContain(claudeSessionId);
    expect(calls[1]).not.toContain("--session-id");
  });

  it("maps a failed result to FAILED and surfaces the error", async () => {
    const claudeSessionId = "s1";
    const { runCli } = makeScriptedRunCli([
      {
        stdout: streamJsonFor({ sessionId: claudeSessionId, text: "boom", isError: true }),
        stderr: "",
        exitCode: 0,
      },
    ]);
    const adapter = new ClaudeCodeAdapter(silentLogger(), runCli);

    const session = await adapter.startSession({
      projectId: "p1",
      projectPath: "/x",
      initialInstruction: "break it",
    });

    expect(session.status).toBe("FAILED");
  });

  it("maps a non-empty permission_denials to WAITING_FOR_PERMISSION", async () => {
    const claudeSessionId = "s1";
    const { runCli } = makeScriptedRunCli([
      {
        stdout: streamJsonFor({
          sessionId: claudeSessionId,
          text: "needs approval",
          permissionDenials: [{ tool: "Bash" }],
        }),
        stderr: "",
        exitCode: 0,
      },
    ]);
    const adapter = new ClaudeCodeAdapter(silentLogger(), runCli);

    const session = await adapter.startSession({
      projectId: "p1",
      projectPath: "/x",
      initialInstruction: "do something risky",
    });

    expect(session.status).toBe("WAITING_FOR_PERMISSION");
  });

  it("stopSession kills an in-flight dispatch and lands on STOPPED", async () => {
    const control = makeControllableRunCli();
    const adapter = new ClaudeCodeAdapter(silentLogger(), control.runCli);
    const started = await adapter.startSession({ projectId: "p1", projectPath: "/x" });

    const sendPromise = adapter.sendInstruction(started.id, "a long-running task");
    await adapter.stopSession(started.id);
    await sendPromise;

    expect(control.wasKilled()).toBe(true);
    expect(await adapter.getStatus(started.id)).toBe("STOPPED");
  });

  it("getStatus throws SessionNotFoundError for an unknown session", async () => {
    const { runCli } = makeScriptedRunCli([]);
    const adapter = new ClaudeCodeAdapter(silentLogger(), runCli);

    await expect(adapter.getStatus("session_missing")).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("getSession returns the full current record, and throws for an unknown session", async () => {
    const { runCli } = makeScriptedRunCli([]);
    const adapter = new ClaudeCodeAdapter(silentLogger(), runCli);

    const started = await adapter.startSession({ projectId: "p1", projectPath: "/x" });
    expect(await adapter.getSession(started.id)).toEqual(started);

    await expect(adapter.getSession("session_missing")).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("delivers output and status_changed events during a dispatch", async () => {
    const claudeSessionId = "s1";
    const { runCli } = makeScriptedRunCli([
      { stdout: streamJsonFor({ sessionId: claudeSessionId, text: "OK" }), stderr: "", exitCode: 0 },
    ]);
    const adapter = new ClaudeCodeAdapter(silentLogger(), runCli);
    const session = await adapter.startSession({ projectId: "p1", projectPath: "/x" });

    const events: SessionAdapterEvent[] = [];
    adapter.subscribe(session.id, (e) => events.push(e));
    await adapter.sendInstruction(session.id, "go");

    expect(events.some((e) => e.type === "output")).toBe(true);
    expect(events.some((e) => e.type === "status_changed")).toBe(true);
    expect(events.some((e) => e.type === "completed")).toBe(true);
  });

  describe("discoverSessions", () => {
    it("parses claude agents --json --all output via the injected runner", async () => {
      const { runCli, calls } = makeScriptedRunCli([
        {
          stdout: JSON.stringify([
            { pid: 1, cwd: "/x", kind: "interactive", sessionId: "s1", status: "idle" },
          ]),
          stderr: "",
          exitCode: 0,
        },
      ]);
      const adapter = new ClaudeCodeAdapter(silentLogger(), runCli);

      const discovered = await adapter.discoverSessions();

      expect(calls[0]).toEqual(["agents", "--json", "--all"]);
      expect(discovered).toHaveLength(1);
      expect(discovered[0]?.claudeSessionId).toBe("s1");
    });

    it("returns an empty list and logs when the CLI exits non-zero", async () => {
      const { runCli } = makeScriptedRunCli([{ stdout: "", stderr: "boom", exitCode: 1 }]);
      const adapter = new ClaudeCodeAdapter(silentLogger(), runCli);

      expect(await adapter.discoverSessions()).toEqual([]);
    });
  });
});
