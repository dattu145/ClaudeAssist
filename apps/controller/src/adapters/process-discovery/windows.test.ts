import { describe, expect, it } from "vitest";
import { parseWindowsProcessListing, WindowsProcessDiscoveryService } from "./windows.js";
import type { ExecCommand } from "./exec-command.js";

describe("parseWindowsProcessListing", () => {
  it("parses a multi-row array (real ConvertTo-Json -Compress shape)", () => {
    const stdout = JSON.stringify([
      { ProcessId: 1234, Name: "claude.exe", CommandLine: "claude.exe --version", ParentProcessId: 1 },
      { ProcessId: 5678, Name: "node.exe", CommandLine: null, ParentProcessId: 1234 },
    ]);

    const processes = parseWindowsProcessListing(stdout);

    expect(processes).toEqual([
      { pid: 1234, name: "claude.exe", commandLine: "claude.exe --version", parentPid: 1 },
      { pid: 5678, name: "node.exe", commandLine: null, parentPid: 1234 },
    ]);
  });

  it("normalizes a bare object (PowerShell's single-result shape) into an array", () => {
    const stdout = JSON.stringify({
      ProcessId: 42,
      Name: "claude.exe",
      CommandLine: "claude.exe",
      ParentProcessId: null,
    });

    const processes = parseWindowsProcessListing(stdout);

    expect(processes).toEqual([
      { pid: 42, name: "claude.exe", commandLine: "claude.exe", parentPid: null },
    ]);
  });

  it("skips malformed rows instead of throwing", () => {
    const stdout = JSON.stringify([
      { ProcessId: 1, Name: "ok.exe" },
      { Name: "missing-pid.exe" },
      { ProcessId: "not-a-number", Name: "bad-type.exe" },
    ]);

    const processes = parseWindowsProcessListing(stdout);

    expect(processes).toEqual([{ pid: 1, name: "ok.exe", commandLine: null, parentPid: null }]);
  });

  it("returns an empty list for unparseable JSON", () => {
    expect(parseWindowsProcessListing("not json")).toEqual([]);
  });
});

describe("WindowsProcessDiscoveryService", () => {
  function fakeExec(stdout: string, exitCode: number | null = 0): ExecCommand {
    return () => Promise.resolve({ stdout, exitCode });
  }

  it("listProcesses returns the parsed listing", async () => {
    const stdout = JSON.stringify([{ ProcessId: 1, Name: "claude.exe", ParentProcessId: null }]);
    const service = new WindowsProcessDiscoveryService(fakeExec(stdout));

    expect(await service.listProcesses()).toEqual([
      { pid: 1, name: "claude.exe", commandLine: null, parentPid: null },
    ]);
  });

  it("listProcesses returns an empty list on a non-zero exit code", async () => {
    const service = new WindowsProcessDiscoveryService(fakeExec("", 1));
    expect(await service.listProcesses()).toEqual([]);
  });

  it("findClaudeProcesses filters to claude executables only", async () => {
    const stdout = JSON.stringify([
      { ProcessId: 1, Name: "claude.exe", ParentProcessId: null },
      { ProcessId: 2, Name: "node.exe", ParentProcessId: null },
      { ProcessId: 3, Name: "claude.cmd", ParentProcessId: null },
    ]);
    const service = new WindowsProcessDiscoveryService(fakeExec(stdout));

    const found = await service.findClaudeProcesses();

    expect(found.map((p) => p.pid)).toEqual([1, 3]);
  });
});
