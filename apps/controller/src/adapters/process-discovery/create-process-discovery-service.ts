import type { ProcessDiscoveryService } from "../../domain/process-discovery/service.js";
import { WindowsProcessDiscoveryService } from "./windows.js";
import { PosixProcessDiscoveryService } from "./posix.js";

export function createProcessDiscoveryService(): ProcessDiscoveryService {
  return process.platform === "win32"
    ? new WindowsProcessDiscoveryService()
    : new PosixProcessDiscoveryService();
}
