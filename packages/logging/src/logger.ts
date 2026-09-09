import { redact } from "./redact.js";
import { LOG_LEVEL_ORDER, type LogContext, type Logger, type LogLevel } from "./types.js";

export interface CreateLoggerOptions {
  minLevel?: LogLevel;
  /** Injectable for tests; defaults to process.stdout.write. */
  write?: (line: string) => void;
}

function levelRank(level: LogLevel): number {
  return LOG_LEVEL_ORDER.indexOf(level);
}

function buildLogger(
  baseContext: Record<string, unknown>,
  minLevel: LogLevel,
  write: (line: string) => void
): Logger {
  const log = (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
    if (levelRank(level) < levelRank(minLevel)) {
      return;
    }
    const entry = redact({
      ...baseContext,
      ...context,
      timestamp: new Date().toISOString(),
      level,
      message,
    });
    write(`${JSON.stringify(entry)}\n`);
  };

  return {
    debug: (message, context) => log("debug", message, context),
    info: (message, context) => log("info", message, context),
    warn: (message, context) => log("warn", message, context),
    error: (message, context) => log("error", message, context),
    child: (context) => buildLogger({ ...baseContext, ...context }, minLevel, write),
  };
}

/**
 * Creates a structured JSON-line logger. `baseContext.component` is required
 * so every log line is attributable (see .claude/architecture — OBSERVABILITY
 * requirements). Filters by `minLevel` (default "info").
 */
export function createLogger(
  baseContext: LogContext,
  options: CreateLoggerOptions = {}
): Logger {
  const minLevel = options.minLevel ?? "info";
  const write = options.write ?? ((line: string) => process.stdout.write(line));
  return buildLogger(baseContext, minLevel, write);
}
