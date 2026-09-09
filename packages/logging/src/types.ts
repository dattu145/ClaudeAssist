import { ConfigSchema, type Config } from "@claudeops/config";

/**
 * Reuses packages/config's LOG_LEVEL enum (rather than redefining the union)
 * so the two can never drift. `LOG_LEVEL_ORDER` mirrors the enum's declared
 * order and is what filtering compares against.
 */
export type LogLevel = Config["LOG_LEVEL"];
export const LOG_LEVEL_ORDER = ConfigSchema.shape.LOG_LEVEL.removeDefault().options;

export interface LogContext {
  component: string;
  event?: string;
  projectId?: string;
  sessionId?: string;
  taskId?: string;
  requestId?: string;
  [extra: string]: unknown;
}

export interface LogEntry extends LogContext {
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}
