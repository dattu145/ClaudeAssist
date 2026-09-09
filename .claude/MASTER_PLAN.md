# ClaudeOps Master Plan

## Mission
See top-level README.md. Phase 1 = local Claude Code Session Controller +
dashboard-only mobile client. Voice/Bordio/WhatsApp/multi-user/orchestration
are explicitly future phases (ARCHITECTURE.md "Non-goals").

## Phase 1 page sequence (final, after repo inspection + research)

1. **page1 — Project foundation & monorepo skeleton**: npm workspaces, TS
   project references, ESLint/Prettier, `packages/shared` skeleton, root
   scripts, `.env.example`, git init.
2. **page2 — packages/protocol & packages/config**: Zod schemas for
   Project/Session/Task/Event + REST/WS wire types shared by controller and
   mobile; env schema.
3. **page3 — packages/logging**: structured JSON logger + rotation doc.
4. **page4 — Controller foundation**: Express/Fastify app skeleton, `/health`,
   graceful shutdown, SIGINT/SIGTERM handling, SQLite bootstrap + migrations.
5. **page5 — Session state machine + domain entities**: typed states,
   transition validator, unit tests (TEST_PLAN.md "state-machine" layer).
6. **page6 — Project Registry**: repository + service + REST routes
   (`/projects*`), tests.
7. **page7 — `FakeClaudeSessionAdapter` + `ClaudeSessionAdapter` interface**:
   built before the real adapter so everything downstream is testable.
8. **page8 — `ClaudeCodeAdapter` (real)**: implements the interface per
   research/claude-code.md / ADR-003.
9. **page9 — Session Registry**: wraps the adapter, discovery, status
   tracking, event emission.
10. **page10 — Event system + EventRepository**: bus, persistence, `/sessions/:id/events`.
11. **page11 — Task system**: task state machine, `TaskRepository`,
    instruction dispatch wiring into the adapter.
12. **page12 — REST API completion**: remaining endpoints
    (`/sessions*`, `/sessions/:id/instructions|resume|stop|cancel`), Zod
    validation on every route.
13. **page13 — WebSocket API**: versioned protocol, subscribe/broadcast,
    reconnect-friendly handshake.
14. **page14 — Pairing & auth**: pairing code issuance, token auth middleware,
    `PairingRepository`.
15. **page15 — ProcessDiscoveryService**: Windows implementation first
    (primary dev host), interface built for portability.
16. **page16 — Startup reconciliation**: the algorithm in
    architecture/session-model.md, recovery tests.
17. **page17 — Mobile foundation**: Expo app skeleton, navigation shell,
    pairing screen, connection-state indicator.
18. **page18 — Mobile dashboard + session/project/task screens**: wired to
    real controller via `packages/protocol` types.
19. **page19 — NotificationService (Console) + domain-event wiring**.
20. **page20 — CommandRouter/IntentResolver interfaces**: no LLM impl; used
    internally to route the mobile-issued commands, proving the abstraction
    before voice ever needs it (ADR-005).
21. **page21 — 24/7 hardening & reliability pass**: bounded memory checks,
    log rotation wiring, full recovery test suite, docs/PROGRESS.md finalized
    against the Phase 1 Acceptance Criteria checklist in the original spec.

Each page file lives at `.claude/plans/pageN.md` and follows the required
template (Objective/Why/Prerequisites/Implementation/Files Changed/
Tests/Acceptance Criteria/Risks/Completion Checklist). Only page1.md is
written before implementation approval; later pages are written immediately
before that page's implementation begins, so they reflect the real state of
the repo rather than upfront guesses.

## Rule
No page is started until the previous page's Acceptance Criteria are met and
PROGRESS.md is updated. No feature outside this sequence (voice, Bordio,
WhatsApp, LLM orchestration) is implemented during Phase 1.
