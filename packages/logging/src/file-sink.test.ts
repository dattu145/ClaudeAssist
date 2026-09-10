import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRotatingFileWriter } from "./file-sink.js";

describe("createRotatingFileWriter", () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "claudeops-file-sink-"));
    filePath = join(dir, "controller.log");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("appends lines to the file", () => {
    const write = createRotatingFileWriter(filePath, { maxBytes: 1024 });
    write("line one\n");
    write("line two\n");

    expect(readFileSync(filePath, "utf-8")).toBe("line one\nline two\n");
  });

  it("rotates to .1 once the byte threshold is crossed", () => {
    const write = createRotatingFileWriter(filePath, { maxBytes: 20 });
    write("0123456789\n"); // 11 bytes, under threshold
    write("0123456789\n"); // would push the file over 20 bytes -> rotate first

    expect(existsSync(`${filePath}.1`)).toBe(true);
    expect(readFileSync(`${filePath}.1`, "utf-8")).toBe("0123456789\n");
    expect(readFileSync(filePath, "utf-8")).toBe("0123456789\n");
  });

  it("shifts older rotations up to maxFiles and drops the oldest", () => {
    const write = createRotatingFileWriter(filePath, { maxBytes: 5, maxFiles: 2 });
    write("aaaaa\n"); // 6 bytes, under 5? actually over -> but file doesn't exist yet, no rotate
    write("bbbbb\n"); // rotate: current -> .1
    write("ccccc\n"); // rotate: .1 -> .2, current -> .1
    write("ddddd\n"); // rotate: .2 dropped, .1 -> .2, current -> .1

    expect(readFileSync(filePath, "utf-8")).toBe("ddddd\n");
    expect(readFileSync(`${filePath}.1`, "utf-8")).toBe("ccccc\n");
    expect(readFileSync(`${filePath}.2`, "utf-8")).toBe("bbbbb\n");
  });

  it("does not rotate before the file exists", () => {
    const write = createRotatingFileWriter(filePath, { maxBytes: 1 });
    write("this line alone is already over maxBytes\n");

    expect(existsSync(`${filePath}.1`)).toBe(false);
    expect(readFileSync(filePath, "utf-8")).toBe("this line alone is already over maxBytes\n");
  });
});
