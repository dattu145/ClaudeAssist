import { loadConfig } from "@claudeops/config";
import { createLogger } from "@claudeops/logging";
import { startController, registerShutdownHandlers } from "./lifecycle.js";

const config = loadConfig();
const logger = createLogger({ component: "controller" }, { minLevel: config.LOG_LEVEL });

const controller = startController(config, logger);
registerShutdownHandlers(controller, logger);
