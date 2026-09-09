# Troubleshooting

(Populated as real issues are hit — this is a living doc, not a pre-written
FAQ.)

## "Why isn't this Claude session working?" — diagnostic checklist
1. `GET /health` — is the controller itself healthy (DB, event bus, uptime)?
2. Does `claude doctor` pass on the controller host?
3. `claude agents --json --all` — does the CLI itself see the session?
4. Does the persisted session state match reality (last reconciliation time
   in `/health`)?
5. Check `.claudeops/logs` (structured JSON) filtered by `sessionId` for the
   last events before the problem.
6. `claude logs <bg-id>` for raw terminal output as a fallback cross-check
   against parsed stream-json events.
