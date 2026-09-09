# Risks and Technical Constraints

| Risk | Impact | Mitigation |
|---|---|---|
| `claude` CLI flags change between versions | Adapter breaks silently | Version check on startup (`claude --version`/`doctor`); adapter tests run against the real CLI in CI where possible; research doc re-verified on upgrade |
| No supported way to attach to a manually-started interactive session | Voice/mobile can't send instructions into sessions the user opened by hand | Documented limitation (ADR-003); Phase 1 scope is managed sessions + read-only discovery of others |
| Terminal discovery is not reliably cross-platform | `Terminal` entity often null/best-effort | Modeled as optional metadata, never load-bearing for core state (architecture/session-model.md) |
| stream-json parsing edge cases (partial lines, malformed JSON, tool-use nesting) | Missed/duplicate events, incorrect state | Buffered line parsing with tests against captured real CLI output; malformed lines logged, not thrown |
| SQLite single-writer under bursty event volume | Write contention on long-running heavy sessions | Batch event writes; WAL mode; revisit only if profiling shows an issue |
| Windows-first dev environment vs. eventual macOS/Linux use | `ProcessDiscoveryService` must not hard-code one OS | Platform abstraction with per-OS implementations from the start (spec requirement) |
| Mobile app on a network without reachable controller (no tunnel yet) | Dashboard unusable off-LAN | Explicitly out of scope for Phase 1; document as a known limitation, not solved with a quick tunnel hack |
| Android background/mic restrictions | Future voice feature could over-promise | research/android-background.md stub flags this before any implementation starts |
| Scope creep into voice/WhatsApp/Bordio during Phase 1 | Phase 1 never ships | Hard boundary enforced by MASTER_PLAN.md page sequence; those integrations are separate, later pages |
