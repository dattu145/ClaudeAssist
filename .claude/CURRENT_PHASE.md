# Current Phase

**Phase 1 — Claude Code Session Controller (dashboard-only mobile client)**
**Phase 2 — Bordio integration**

Status: **Both phases are complete.** Phase 1 closed at page21; Phase 2
closed at pageB5 (see `PROGRESS.md`'s two close-out sections). Session
status mirrors onto Bordio tasks and a user can reply to a linked task to
send an instruction back — both directions off by default
(`BORDIO_API_KEY`/`BORDIO_COMMAND_TAG_ID`). A voice architecture audit
(`research/voice.md`) confirmed the command layer stays decoupled from
any future STT/TTS provider. The session-resume-after-restart gap
pageB5's audit found is fixed (`ClaudeSessionAdapter.rehydrate`,
`SessionRegistry.ensureAdapterKnowsSession`). Git push access is fixed —
everything above is pushed to `origin/main`.
Next: nothing queued. Real next steps whenever the user is ready: get a
real Bordio API key/workspace to verify the integration for real, or
scope Phase 3 (voice, per research/voice.md's own numbering).
