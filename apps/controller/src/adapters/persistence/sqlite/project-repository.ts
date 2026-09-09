import type { Database } from "better-sqlite3";
import { ProjectSchema, type Project } from "@claudeops/protocol";
import type { ProjectRepository } from "../../../domain/project/repository.js";

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToProject(row: ProjectRow): Project {
  return ProjectSchema.parse({
    id: row.id,
    name: row.name,
    path: row.path,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database) {}

  async create(project: Project): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO projects (id, name, path, status, created_at, updated_at)
         VALUES (@id, @name, @path, @status, @createdAt, @updatedAt)`
      )
      .run(project);
  }

  async findById(id: string): Promise<Project | null> {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as
      | ProjectRow
      | undefined;
    return row ? rowToProject(row) : null;
  }

  async list(): Promise<Project[]> {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY created_at ASC").all() as
      ProjectRow[];
    return rows.map(rowToProject);
  }

  async update(project: Project): Promise<void> {
    this.db
      .prepare(
        `UPDATE projects
         SET name = @name, path = @path, status = @status, updated_at = @updatedAt
         WHERE id = @id`
      )
      .run(project);
  }

  async remove(id: string): Promise<void> {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  }
}
