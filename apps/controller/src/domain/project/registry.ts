import { nowIso } from "@claudeops/shared";
import type { Project } from "@claudeops/protocol";
import { ProjectNotFoundError } from "../errors.js";
import { createProject, validateProjectPath, type CreateProjectInput } from "./entity.js";
import type { ProjectRepository } from "./repository.js";

export type UpdateProjectPatch = Partial<Pick<Project, "name" | "path" | "status">>;

/**
 * Business rules for projects (path validation, not-found handling) live
 * here — never in the repository (persistence only) or the HTTP layer
 * (transport only).
 */
export class ProjectRegistry {
  constructor(private readonly repository: ProjectRepository) {}

  async registerProject(input: CreateProjectInput): Promise<Project> {
    validateProjectPath(input.path);
    const project = createProject(input);
    await this.repository.create(project);
    return project;
  }

  async getProject(id: string): Promise<Project> {
    const project = await this.repository.findById(id);
    if (!project) {
      throw new ProjectNotFoundError(id);
    }
    return project;
  }

  async listProjects(): Promise<Project[]> {
    return this.repository.list();
  }

  async updateProject(id: string, patch: UpdateProjectPatch): Promise<Project> {
    const existing = await this.getProject(id);
    if (patch.path !== undefined && patch.path !== existing.path) {
      validateProjectPath(patch.path);
    }
    const updated: Project = { ...existing, ...patch, updatedAt: nowIso() };
    await this.repository.update(updated);
    return updated;
  }

  async removeProject(id: string): Promise<void> {
    await this.getProject(id);
    await this.repository.remove(id);
  }
}
