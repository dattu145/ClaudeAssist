/**
 * The typed command surface ADR-005 requires: every mutating session
 * operation a source (mobile today; voice/WhatsApp later) can trigger,
 * as a single discriminated union. `CommandRouter` dispatches these;
 * `IntentResolver` (future, not Phase 1) will be what produces them from
 * natural-language input instead of a typed REST body.
 */
export type Command =
  | { type: "SEND_INSTRUCTION"; sessionId: string; instruction: string }
  | { type: "RESUME_SESSION"; sessionId: string }
  | { type: "STOP_SESSION"; sessionId: string }
  | { type: "CANCEL_TASK"; sessionId: string };

export type CommandType = Command["type"];
