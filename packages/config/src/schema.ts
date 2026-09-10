import { z } from "zod";

/** Mirrors .env.example — keep the two in sync when adding a var. */
export const ConfigSchema = z.object({
  // 0 is a valid value (delegates to the OS to pick a free ephemeral port —
  // used by tests; a real deployment sets an explicit port).
  PORT: z.coerce.number().int().nonnegative().default(4000),
  DATA_DIR: z.string().min(1).default("~/.claudeops"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PAIRING_TOKEN_TTL: z.coerce.number().int().positive().default(2_592_000),
  DISCOVERY_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  // Unset (the default) means file logging is off — stdout only. Set to
  // enable it for a headless 24/7 run (page21: packages/logging/src/
  // rotation.md).
  LOG_FILE: z.string().min(1).optional(),
  LOG_MAX_FILE_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  LOG_MAX_FILES: z.coerce.number().int().positive().default(5),
});

export type Config = z.infer<typeof ConfigSchema>;
