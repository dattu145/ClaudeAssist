import { ConfigSchema, type Config } from "./schema.js";

export class ConfigValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid ClaudeOps controller configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "ConfigValidationError";
  }
}

/**
 * Loads and validates controller config from environment variables.
 * Empty-string env vars are treated as unset so declared defaults apply
 * (matches .env.example's convention of leaving optional vars blank).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const input: Record<string, string> = {};
  for (const key of Object.keys(ConfigSchema.shape)) {
    const value = env[key];
    if (value !== undefined && value !== "") {
      input[key] = value;
    }
  }

  const result = ConfigSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new ConfigValidationError(issues);
  }

  return result.data;
}
