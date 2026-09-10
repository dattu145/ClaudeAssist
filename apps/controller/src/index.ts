import { loadConfig } from "@claudeops/config";
import { createLogger, createRotatingFileWriter } from "@claudeops/logging";
import { startController, registerShutdownHandlers } from "./lifecycle.js";

const config = loadConfig();

// Unset LOG_FILE (the default) means stdout only, matching every prior
// page's dev-run behavior. Set it for a headless 24/7 run (page21: see
// packages/logging/src/rotation.md) — both stdout and the file get every
// line, so `npm run dev` still shows output in the terminal even with
// LOG_FILE configured.
const write = config.LOG_FILE
  ? (() => {
      const fileWrite = createRotatingFileWriter(config.LOG_FILE as string, {
        maxBytes: config.LOG_MAX_FILE_BYTES,
        maxFiles: config.LOG_MAX_FILES,
      });
      return (line: string) => {
        process.stdout.write(line);
        fileWrite(line);
      };
    })()
  : undefined;

const logger = createLogger(
  { component: "controller" },
  { minLevel: config.LOG_LEVEL, ...(write ? { write } : {}) }
);

const controller = await startController(config, logger);
registerShutdownHandlers(controller, logger);
