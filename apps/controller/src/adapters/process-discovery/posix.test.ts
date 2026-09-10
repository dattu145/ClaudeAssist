import { describe, expect, it } from "vitest";
import { parsePosixProcessListing, PosixProcessDiscoveryService } from "./posix.js";
import type { ExecCommand } from "./exec-command.js";

describe("parsePosixProcessListing", () => {
  it("parses representative `ps -eo pid=,ppid=,comm=,args=` output", () => {
    const stdout = [
      "    1     0 launchd  /sbin/launchd",
      " 1234     1 claude   /usr/local/bin/claude --version",
      " 5678  1234 node     node index.js --flag value",
    ].join("\n");

    const processes = parsePosixProcessListing(stdout);

    expect(processes).toEqual([
      { pid: 1, name: "launchd", commandLine: "/sbin/launchd", parentPid: 0 },
      { pid: 1234, name: "claude", commandLine: "/usr/local/bin/claude --version", parentPid: 1 },
      { pid: 5678, name: "node", commandLine: "node index.js --flag value", parentPid: 1234 },
    ]);
  });

  it("handles a command with no args (commandLine equal to just comm)", () => {
    const processes = parsePosixProcessListing(" 99 1 sh sh");
    expect(processes).toEqual([{ pid: 99, name: "sh", commandLine: "sh", parentPid: 1 }]);
  });

  it("skips blank lines", () => {
    const stdout = " 1 0 init init\n\n   \n 2 1 bash bash";
    expect(parsePosixProcessListing(stdout)).toHaveLength(2);
  });

  it("skips unparseable lines instead of throwing", () => {
    const stdout = "garbage line\n 1 0 init init";
    expect(parsePosixProcessListing(stdout)).toEqual([
      { pid: 1, name: "init", commandLine: "init", parentPid: 0 },
    ]);
  });
});

describe("PosixProcessDiscoveryService", () => {
  function fakeExec(stdout: string, exitCode: number | null = 0): ExecCommand {
    return () => Promise.resolve({ stdout, exitCode });
  }

  it("listProcesses returns the parsed listing", async () => {
    const service = new PosixProcessDiscoveryService(fakeExec(" 1 0 init init"));
    expect(await service.listProcesses()).toEqual([
      { pid: 1, name: "init", commandLine: "init", parentPid: 0 },
    ]);
  });

  it("listProcesses returns an empty list on a non-zero exit code", async () => {
    const service = new PosixProcessDiscoveryService(fakeExec("", 1));
    expect(await service.listProcesses()).toEqual([]);
  });

  it("findClaudeProcesses filters to claude executables only", async () => {
    const stdout = [" 1 0 claude claude", " 2 0 node node"].join("\n");
    const service = new PosixProcessDiscoveryService(fakeExec(stdout));

    const found = await service.findClaudeProcesses();

    expect(found.map((p) => p.pid)).toEqual([1]);
  });
});
