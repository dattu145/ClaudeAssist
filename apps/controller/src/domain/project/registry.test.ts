import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Project } from "@claudeops/protocol";
import { ProjectNotFoundError } from "../errors.js";
import { InvalidProjectPathError } from "./entity.js";
import { ProjectRegistry } from "./registry.js";
import type { ProjectRepository } from "./repository.js";

class FakeProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, Project>();

  async create(project: Project): Promise<void> {
    this.projects.set(project.id, project);
  }
  async findById(id: string): Promise<Project | null> {
    return this.projects.get(id) ?? null;
  }
  async list(): Promise<Project[]> {
    return [...this.projects.values()];
  }
  async update(project: Project): Promise<void> {
    this.projects.set(project.id, project);
  }
  async remove(id: string): Promise<void> {
    this.projects.delete(id);
  }
}

describe("ProjectRegistry", () => {
  let dir: string;
  let registry: ProjectRegistry;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "claudeops-registry-"));
    registry = new ProjectRegistry(new FakeProjectRepository());
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("registers a project after validating its path", async () => {
    const project = await registry.registerProject({ name: "Website", path: dir });
    expect(project.name).toBe("Website");
  });

  it("rejects registration of an invalid path", async () => {
    await expect(
      registry.registerProject({ name: "Ghost", path: join(dir, "nope") })
    ).rejects.toBeInstanceOf(InvalidProjectPathError);
  });

  it("throws ProjectNotFoundError for an unknown id", async () => {
    await expect(registry.getProject("project_missing")).rejects.toBeInstanceOf(
      ProjectNotFoundError
    );
  });

  it("lists registered projects", async () => {
    await registry.registerProject({ name: "Website", path: dir });
    const projects = await registry.listProjects();
    expect(projects).toHaveLength(1);
  });

  it("updates a project's name and bumps updatedAt", async () => {
    const project = await registry.registerProject({ name: "Website", path: dir });
    await new Promise((r) => setTimeout(r, 5));

    const updated = await registry.updateProject(project.id, { name: "New Name" });

    expect(updated.name).toBe("New Name");
    expect(updated.updatedAt).not.toBe(project.updatedAt);
  });

  it("validates a new path on update", async () => {
    const project = await registry.registerProject({ name: "Website", path: dir });

    await expect(
      registry.updateProject(project.id, { path: join(dir, "nope") })
    ).rejects.toBeInstanceOf(InvalidProjectPathError);
  });

  it("removes a project", async () => {
    const project = await registry.registerProject({ name: "Website", path: dir });
    await registry.removeProject(project.id);

    await expect(registry.getProject(project.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it("removing an unknown project throws ProjectNotFoundError", async () => {
    await expect(registry.removeProject("project_missing")).rejects.toBeInstanceOf(
      ProjectNotFoundError
    );
  });
});
