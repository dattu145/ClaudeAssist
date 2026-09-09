import { SHARED_PACKAGE_VERSION } from "@claudeops/shared";
import { loadConfig } from "@claudeops/config";
import { ProjectSchema } from "@claudeops/protocol";
import { createLogger } from "@claudeops/logging";

// Scaffolding only (page1/page2/page3). Real server/controller wiring lands
// in page4 (see .claude/plans and .claude/MASTER_PLAN.md). This just proves
// the workspace packages wire together correctly.
const config = loadConfig();
const logger = createLogger({ component: "controller-bootstrap" }, { minLevel: config.LOG_LEVEL });

logger.info("controller scaffold starting", {
  sharedVersion: SHARED_PACKAGE_VERSION,
  port: config.PORT,
  logLevel: config.LOG_LEVEL,
  projectSchemaLoaded: typeof ProjectSchema.parse !== "undefined",
});
