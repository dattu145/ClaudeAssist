import { describe, expect, it } from "vitest";
import { createProcessDiscoveryService } from "./create-process-discovery-service.js";
import { WindowsProcessDiscoveryService } from "./windows.js";
import { PosixProcessDiscoveryService } from "./posix.js";

describe("createProcessDiscoveryService", () => {
  it(`returns the implementation matching this machine's platform (${process.platform})`, () => {
    const service = createProcessDiscoveryService();
    if (process.platform === "win32") {
      expect(service).toBeInstanceOf(WindowsProcessDiscoveryService);
    } else {
      expect(service).toBeInstanceOf(PosixProcessDiscoveryService);
    }
  });
});
