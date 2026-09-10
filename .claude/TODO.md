# TODO

- [x] Get approval on architecture proposal / roadmap
- [x] `git init` the repo
- [x] Decide package manager: npm workspaces (chosen — pnpm not installed)
- [x] Implement page1 (project foundation & monorepo skeleton)
- [ ] Triage `npm audit` findings (15 vulnerabilities, mostly transitive via
      Expo scaffold) — do not force-fix without review
- [x] Write `.claude/plans/page2.md` and implement (packages/protocol & packages/config)
- [x] Committed and pushed page1 to origin/main
- [x] Write `.claude/plans/page3.md` and implement (packages/logging)
- [x] Committed and pushed page2 to origin/main
- [x] Committed and pushed page3 to origin/main
- [x] Write `.claude/plans/page4.md` and implement (controller foundation)
- [x] Committed and pushed page4 to origin/main
- [x] Write `.claude/plans/page5.md` and implement (session state machine +
      domain entities)
- [x] Committed and pushed page5 to origin/main
- [x] Write `.claude/plans/page6.md` and implement (Project Registry)
- [x] Committed and pushed page6 to origin/main
- [x] Write `.claude/plans/page7.md` and implement (FakeClaudeSessionAdapter
      + ClaudeSessionAdapter interface)
- [x] Committed and pushed page7 to origin/main
- [x] Write `.claude/plans/page8.md` and implement (ClaudeCodeAdapter, the
      real implementation)
- [x] Committed and pushed page8 to origin/main
- [x] Write `.claude/plans/page9.md` and implement (Session Registry)
- [x] Committed and pushed page9 to origin/main
- [x] Write `.claude/plans/page10.md` and implement (event system + EventRepository)
- [ ] **User: fix git push access** — `git push origin main` fails with
      403; cached credentials on this machine are for GitHub account
      `leadsprogress`, which lacks push access to `dattu145/ClaudeAssist`.
      Page10 and page11 commits are local-only on `main` until resolved.
- [x] Write `.claude/plans/page11.md` and implement (Task system)
- [x] Write `.claude/plans/page12.md` and implement (REST API completion)
- [x] Write `.claude/plans/page13.md` and implement (WebSocket API)
- [x] Write `.claude/plans/page14.md` and implement (pairing & auth)
- [x] Write `.claude/plans/page15.md` and implement (ProcessDiscoveryService)
- [x] Write `.claude/plans/page16.md` and implement (startup reconciliation)
- [x] Write `.claude/plans/page17.md` and implement (mobile foundation)
- [x] Write `.claude/plans/page18.md` and implement (mobile dashboard + real data)
- [ ] **User: fix stored HTTPS git credential** (not just `git config
      user.name` — that alone didn't fix the push) so `leadsprogress` isn't
      used, or grant it push access to `dattu145/ClaudeAssist`
- [ ] Push page10 through page21 to origin/main once access is fixed
- [x] Write `.claude/plans/page19.md` and implement (NotificationService)
- [x] Write `.claude/plans/page20.md` and implement (CommandRouter/IntentResolver interfaces)
- [x] Write `.claude/plans/page21.md` and implement (24/7 hardening & reliability pass — final Phase 1 page)
- [x] **Phase 1 complete** — no page22 in this roadmap
- [x] Scope Phase 2 — Bordio integration chosen; research/bordio.md,
      decisions/ADR-006.md, and MASTER_PLAN.md's Phase 2 page sequence
      (pageB1-B5) written
- [x] Write `.claude/plans/pageB1.md` and implement (BordioClient adapter
      + FakeBordioClient)
- [x] Write `.claude/plans/pageB2.md` and implement (Bordio ID mapping
      persistence)
- [ ] Write `.claude/plans/pageB3.md` and implement (BordioNotificationService, outbound)
- [ ] Write `.claude/plans/pageB4.md` and implement (inbound Bordio command polling)
- [ ] Write `.claude/plans/pageB5.md` and implement (Phase 2 hardening pass)
- [ ] Get a real Bordio API key/workspace to run `bordio-client.real.test.ts`
      for real (currently written but unverified against the live API)
