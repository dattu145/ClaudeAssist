import type { Command } from "./types.js";

/**
 * Translates free-form natural-language input (a voice transcript, a
 * WhatsApp message) into a typed Command the CommandRouter can dispatch,
 * or null if no actionable command was found in it.
 *
 * Interface only — no implementation ships in Phase 1 (ADR-005:
 * "IntentResolver is defined as an interface only — no LLM-backed
 * implementation ships in Phase 1"). Voice/Bordio/WhatsApp are
 * out-of-scope non-goals for this phase (ARCHITECTURE.md). Drawing the
 * interface now means a future resolver is a new adapter producing a
 * Command, not a rewrite of how commands execute.
 */
export interface IntentResolver {
  resolve(input: string): Promise<Command | null>;
}
