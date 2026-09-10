import { appendFileSync, existsSync, renameSync, statSync, unlinkSync } from "node:fs";

export interface RotatingFileWriterOptions {
  /** Rotate once the file would exceed this size. Default 10 MiB. */
  maxBytes?: number;
  /** How many rotated files to keep (`file.log.1` .. `file.log.{maxFiles}`),
   * oldest dropped beyond that. Default 5. */
  maxFiles?: number;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;

/**
 * A minimal, dependency-free size-based rotating file writer (page21: see
 * rotation.md for why this is hand-rolled rather than pulling in a
 * rotation library — zero new deps, matching ADR-002/ADR-004's
 * single-process/zero-external-infra stance). Synchronous by design: log
 * writes must not silently reorder relative to each other or to the
 * rotation check, and volume here (one line per structured log call) never
 * justifies the complexity of an async queue.
 */
export function createRotatingFileWriter(
  filePath: string,
  options: RotatingFileWriterOptions = {}
): (line: string) => void {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;

  function currentSize(): number {
    return existsSync(filePath) ? statSync(filePath).size : 0;
  }

  function rotate(): void {
    const oldest = `${filePath}.${maxFiles}`;
    if (existsSync(oldest)) {
      unlinkSync(oldest);
    }
    for (let i = maxFiles - 1; i >= 1; i--) {
      const from = `${filePath}.${i}`;
      if (existsSync(from)) {
        renameSync(from, `${filePath}.${i + 1}`);
      }
    }
    renameSync(filePath, `${filePath}.1`);
  }

  return (line: string) => {
    if (currentSize() + Buffer.byteLength(line) > maxBytes && existsSync(filePath)) {
      rotate();
    }
    appendFileSync(filePath, line);
  };
}
