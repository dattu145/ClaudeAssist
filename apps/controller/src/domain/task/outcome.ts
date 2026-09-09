import type { TaskStatus } from "@claudeops/protocol";
import type { InstructionResult } from "../session/adapter.js";

export const INSTRUCTION_RESULT_TO_TASK_STATUS: Record<InstructionResult["status"], TaskStatus> = {
  completed: "COMPLETED",
  waiting_for_input: "WAITING",
  waiting_for_permission: "WAITING",
  failed: "FAILED",
};
