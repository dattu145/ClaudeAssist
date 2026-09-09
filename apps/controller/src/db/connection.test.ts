import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase, resolveDataDir } from "./connection.js";

describe("resolveDataDir", () => {
  it("expands a leading ~ to the home directory", () => {
    expect(resolveDataDir("~/.claudeops")).toBe(join(homedir(), ".claudeops"));
  });

  it("leaves an absolute path untouched", () => {
    const abs = join(tmpdir(), "claudeops-test-abs");
    expect(resolveDataDir(abs)).toBe(abs);
  });
});

describe("openDatabase", () => {
  let dir: string;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates the data directory and a queryable database if missing", () => {
    dir = join(mkdtempSync(join(tmpdir(), "claudeops-db-")), "nested", "data-dir");
    expect(existsSync(dir)).toBe(false);

    const db = openDatabase(dir);
    expect(existsSync(dir)).toBe(true);
    expect(db.prepare("SELECT 1 as ok").get()).toEqual({ ok: 1 });
    db.close();
  });
});
