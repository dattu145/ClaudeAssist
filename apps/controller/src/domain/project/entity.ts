import { existsSync, statSync } from "node:fs";
import { generateId, nowIso } from "@claudeops/shared";
import { ProjectSchema, type Project } from "@claudeops/protocol";
import { DomainError } from "../errors.js";

export class InvalidProjectPathError extends DomainError {
  readonly code = "INVALID_PROJECT_PATH";

  constructor(path: string, reason: string) {
    super(`Invalid project path "${path}": ${reason}`);
    this.name = "InvalidProjectPathError";
  }
}

/**
 * Spec's "detect project path" requirement, kept deliberately simple:
 * existence + directory check. Not a Claude-Code-specific probe (e.g.
 * checking for a .git dir) — that would be guessing at a requirement the
 * spec doesn't ask for.
 */
export function validateProjectPath(path: string): void {
  if (!existsSync(path)) {
    throw new InvalidProjectPathError(path, "path does not exist");
  }
  if (!statSync(path).isDirectory()) {
    throw new InvalidProjectPathError(path, "path is not a directory");
  }
}

export interface CreateProjectInput {
  name: string;
  path: string;
}

export function createProject(input: CreateProjectInput): Project {
  const timestamp = nowIso();
  const project: Project = {
    id: generateId("project"),
    name: input.name,
    path: input.path,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return ProjectSchema.parse(project);
}
