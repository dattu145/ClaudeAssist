import type { SessionStatus } from "@claudeops/protocol";
import type { InstructionResult } from "./adapter.js";

/** Shared by every ClaudeSessionAdapter implementation (fake, page7; real,
 * page8) so the outcome -> status mapping can't drift between them. */
export const INSTRUCTION_OUTCOME_TO_STATUS: Record<InstructionResult["status"], SessionStatus> = {
  completed: "COMPLETED",
  waiting_for_input: "WAITING_FOR_INPUT",
  waiting_for_permission: "WAITING_FOR_PERMISSION",
  failed: "FAILED",
};
