/**
 * Compares two filesystem paths for equality, normalizing separators and
 * case (Windows paths are case-insensitive; POSIX paths are not, but
 * lower-casing both sides for comparison is a safe simplification — a
 * project path and a `cwd` differing only in case on POSIX would be an
 * unusual setup this comparison doesn't need to distinguish).
 */
export function isSamePath(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
