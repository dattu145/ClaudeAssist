import type { ClaudeSession, Task } from "@claudeops/protocol";
import type { SessionRegistry } from "../session/registry.js";
import type { TaskRegistry } from "../task/registry.js";
import type { Command } from "./types.js";

/**
 * Dispatches a typed Command to the registry method that already
 * implements it — no new business logic, just a routing layer so
 * whatever produces a Command (today: the REST layer; later: a real
 * IntentResolver) doesn't need to know which registry owns which
 * operation.
 */
export class CommandRouter {
  constructor(
    private readonly sessionRegistry: SessionRegistry,
    private readonly taskRegistry: TaskRegistry
  ) {}

  dispatch(command: Command): Promise<ClaudeSession | Task> {
    switch (command.type) {
      case "SEND_INSTRUCTION":
        return this.taskRegistry.dispatchInstruction(command.sessionId, command.instruction);
      case "RESUME_SESSION":
        return this.sessionRegistry.resumeSession(command.sessionId);
      case "STOP_SESSION":
        return this.sessionRegistry
          .stopSession(command.sessionId)
          .then(() => this.sessionRegistry.getSession(command.sessionId));
      case "CANCEL_TASK":
        return this.taskRegistry.cancelLatestTaskForSession(command.sessionId);
    }
  }
}
