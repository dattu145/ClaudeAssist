import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject, validateProjectPath, InvalidProjectPathError } from "./entity.js";

describe("createProject", () => {
  it("creates a schema-valid, active project", () => {
    const project = createProject({ name: "Website", path: "/x/y" });

    expect(project.status).toBe("active");
    expect(project.name).toBe("Website");
    expect(project.id).toMatch(/^project_/);
    expect(project.createdAt).toBe(project.updatedAt);
  });
});

describe("validateProjectPath", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "claudeops-project-path-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts an existing directory", () => {
    expect(() => validateProjectPath(dir)).not.toThrow();
  });

  it("rejects a nonexistent path", () => {
    expect(() => validateProjectPath(join(dir, "nope"))).toThrow(InvalidProjectPathError);
  });

  it("rejects a path that is a file, not a directory", () => {
    const file = join(dir, "file.txt");
    writeFileSync(file, "hello");
    expect(() => validateProjectPath(file)).toThrow(InvalidProjectPathError);
  });
});
