# Changelog

## 2026-09-09
- Repo inspection performed (Node v24.16.0, npm 11.13.0, Claude Code CLI
  2.1.266, git 2.54.0, no pnpm installed, not yet a git repo, Windows 11).
- Researched Claude Code CLI integration surface (research/claude-code.md).
- Wrote architecture, decisions (ADR-001..005), risks, security, test plan,
  and Phase 1 page roadmap (MASTER_PLAN.md).
- Implemented page1: git init, npm workspaces monorepo skeleton
  (`apps/controller`, `apps/mobile` via `create-expo-app` blank-typescript,
  `packages/shared`), TS project references, ESLint flat config + Prettier,
  root Vitest config, `.env.example`. Verified install/typecheck/lint/test
  and Expo boot (expo-doctor 21/21, Metro starts).
