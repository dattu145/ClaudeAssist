import { SHARED_PACKAGE_VERSION } from "@claudeops/shared";
import { loadConfig } from "@claudeops/config";
import { ProjectSchema } from "@claudeops/protocol";

// Scaffolding only (page1/page2). Real server/controller wiring lands in
// page4 (see .claude/plans and .claude/MASTER_PLAN.md). This just proves
// the workspace packages wire together correctly.
const config = loadConfig();
console.log(
  `ClaudeOps controller scaffold. shared v${SHARED_PACKAGE_VERSION}, ` +
    `port=${config.PORT}, logLevel=${config.LOG_LEVEL}, ` +
    `ProjectSchema loaded=${typeof ProjectSchema.parse !== "undefined"}`
);
