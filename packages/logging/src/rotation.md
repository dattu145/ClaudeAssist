# Log Rotation (Phase 1 stance)

`createLogger` writes single-line JSON to stdout only — it does not write to
files or rotate anything itself. This is deliberate: rotation strategy
depends on how the controller is actually deployed/run as a daemon, which is
decided in page21 (24/7 hardening pass), not here.

Recommended options to choose between at that point, depending on the chosen
deployment:
- Running under a service manager (systemd, Windows Service, pm2, etc.):
  let it capture and rotate stdout — most already do this natively.
- Running as a bare background process piped to a file: pipe through an
  OS-appropriate rotator (e.g. `rotating-file-stream` on Node, or `logrotate`
  on Linux) rather than hand-rolling rotation in `packages/logging`.

Do not add a file transport or rotation dependency to this package before
page21 decides the actual deployment shape — it would be guessing.
