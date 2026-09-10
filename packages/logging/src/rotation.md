# Log Rotation (page21 decision — implemented)

`createLogger` still writes single-line JSON to stdout by default
(unchanged from page3). For a headless 24/7 run, `apps/controller/src/
index.ts` composes stdout with a rotating file writer when `LOG_FILE` is
set (`packages/config`'s `LOG_FILE`/`LOG_MAX_FILE_BYTES`/`LOG_MAX_FILES`,
all optional — unset means the original stdout-only behavior, unchanged
for `npm run dev` and every test).

## What got built

`file-sink.ts`'s `createRotatingFileWriter(filePath, { maxBytes,
maxFiles })`: a minimal, dependency-free, synchronous size-based rotator.
On each write, appends a line, then rotates (`file.log` -> `file.log.1`
-> ... -> `file.log.{maxFiles}`, oldest dropped) once the file would
exceed `maxBytes`. Hand-rolled rather than pulling in a rotation library,
consistent with ADR-002/ADR-004's "zero external infra, single-process,
single-user local daemon" stance, and given the project already carries
an untriaged transitive-dependency vulnerability count (`PROGRESS.md`) —
not a good moment to add another dependency for something this small.

Synchronous by design: log writes must not silently reorder relative to
each other or to the rotation check, and the volume here (one line per
structured log call, from a single process) never justifies an async
write queue.

## What this does NOT handle

- **Concurrent-process-safe rotation.** If the controller is ever run as
  more than one OS process writing to the same log file, this rotator's
  read-then-rename sequence is not atomic across processes. Acceptable
  today (ADR-002/ADR-004: one process, one user); would need revisiting
  if that ever changes.
- **Log shipping / external aggregation.** Out of scope for Phase 1
  (ARCHITECTURE.md non-goals) — this is local file rotation only.

## Verified

`file-sink.test.ts` (rotation at the byte threshold, oldest-file
dropping at `maxFiles`, no rotation before the file exists). A real
end-to-end manual check ran a real `startController()` instance writing
to a real file on real disk with a small `maxBytes`, generated traffic
via real HTTP requests, and confirmed the file actually rotated on disk
(not just asserted in-process) — same bar as every other page's manual
verification.
