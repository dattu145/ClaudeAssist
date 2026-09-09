import { describe, expect, it } from "vitest";
import { parseAgentsJson } from "./agents.js";

const REAL_SAMPLE = JSON.stringify([
  {
    pid: 19700,
    cwd: "C:\\Dattu Personal\\ClaudeAssist",
    kind: "interactive",
    startedAt: 1788934467424,
    sessionId: "28e9a5e2-2871-4735-9fb9-35c277f375fa",
    name: "claudeassist-81",
    status: "busy",
  },
  {
    pid: 37348,
    id: "a2a127a8",
    cwd: "C:\\Dattu Personal\\ClaudeAssist",
    kind: "background",
    startedAt: 1788946916384,
    sessionId: "a2a127a8-1324-4338-a985-e8a279dcf669",
    name: "page8-probe",
    status: "idle",
    state: "done",
  },
]);

describe("parseAgentsJson", () => {
  it("parses a real captured sample (2026-09-09, v2.1.266)", () => {
    const { discovered, skipped } = parseAgentsJson(REAL_SAMPLE);

    expect(skipped).toBe(0);
    expect(discovered).toHaveLength(2);
    expect(discovered[0]).toEqual({
      pid: 19700,
      cwd: "C:\\Dattu Personal\\ClaudeAssist",
      kind: "interactive",
      claudeSessionId: "28e9a5e2-2871-4735-9fb9-35c277f375fa",
      name: "claudeassist-81",
      status: "busy",
      backgroundId: null,
    });
    expect(discovered[1]).toEqual({
      pid: 37348,
      cwd: "C:\\Dattu Personal\\ClaudeAssist",
      kind: "background",
      claudeSessionId: "a2a127a8-1324-4338-a985-e8a279dcf669",
      name: "page8-probe",
      status: "idle",
      backgroundId: "a2a127a8",
    });
  });

  it("returns empty on unparseable JSON", () => {
    expect(parseAgentsJson("not json")).toEqual({ discovered: [], skipped: 0 });
  });

  it("returns empty when the top-level value is not an array", () => {
    expect(parseAgentsJson(JSON.stringify({ oops: true }))).toEqual({
      discovered: [],
      skipped: 0,
    });
  });

  it("skips rows missing required fields instead of throwing", () => {
    const stdout = JSON.stringify([{ pid: 1, cwd: "/x" /* missing kind, sessionId */ }]);

    const { discovered, skipped } = parseAgentsJson(stdout);

    expect(discovered).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("handles a mix of valid and invalid rows", () => {
    const stdout = JSON.stringify([
      { pid: 1, cwd: "/x", kind: "interactive", sessionId: "s1" },
      { garbage: true },
    ]);

    const { discovered, skipped } = parseAgentsJson(stdout);

    expect(discovered).toHaveLength(1);
    expect(skipped).toBe(1);
  });
});
