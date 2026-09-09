import { exec } from "node:child_process";
import type { Database } from "better-sqlite3";
import { HealthResponseSchema, type HealthResponse } from "@claudeops/protocol";

const CLAUDE_CLI_CHECK_TIMEOUT_MS = 3000;

/**
 * Default check: `claude --version` (see .claude/research/claude-code.md).
 * Injectable for tests so they never depend on the real CLI being installed.
 */
export function defaultCheckClaudeCli(): Promise<boolean> {
  return new Promise((resolve) => {
    // exec (shell) so Windows resolves the npm-installed `claude.cmd` shim
    // (execFile without a shell only finds real executables, not .cmd
    // wrappers — see .claude/research/claude-code.md). No user input is
    // interpolated into the command string, so shell injection is not a
    // concern here.
    exec("claude --version", { timeout: CLAUDE_CLI_CHECK_TIMEOUT_MS }, (error) => {
      resolve(!error);
    });
  });
}

function isDbReachable(db: Database): boolean {
  try {
    db.prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}

export interface HealthDeps {
  db: Database;
  startedAt: number;
  checkClaudeCli?: () => Promise<boolean>;
  lastReconciliationAt?: string | null;
}

export async function getHealth(deps: HealthDeps): Promise<HealthResponse> {
  const checkClaudeCli = deps.checkClaudeCli ?? defaultCheckClaudeCli;
  const dbReachable = isDbReachable(deps.db);
  const claudeCliReachable = await checkClaudeCli();

  const health: HealthResponse = {
    status: dbReachable && claudeCliReachable ? "ok" : dbReachable ? "degraded" : "down",
    uptimeSeconds: Math.floor((Date.now() - deps.startedAt) / 1000),
    dbReachable,
    claudeCliReachable,
    lastReconciliationAt: deps.lastReconciliationAt ?? null,
  };

  return HealthResponseSchema.parse(health);
}
