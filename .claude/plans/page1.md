# Page 1: Project Foundation & Monorepo Skeleton

# Objective
Establish the monorepo skeleton (workspaces, TS config, lint/format, git,
env template) with nothing functional yet — a clean base every later page
builds on.

# Why
Every subsequent page (controller, mobile, adapters) needs a working
workspace/build/lint/test setup to land in. Getting this wrong early causes
churn in every later page.

# Prerequisites
None — this is the first page. Repo inspection already done (CHANGELOG.md,
2026-09-09): Node v24.16.0, npm 11.13.0, git 2.54.0 present; pnpm not
installed; Claude Code CLI 2.1.266 present; not yet a git repository.

# Implementation
1. `git init`; add `.gitignore` (node_modules, dist, .env, *.db, .expo, etc).
2. Root `package.json` with npm workspaces: `apps/*`, `packages/*`.
3. Root `tsconfig.base.json` (strict: true, and all strict-family flags on)
   referenced by per-package `tsconfig.json` via TS project references.
4. `packages/shared` — empty package skeleton (`package.json`, `tsconfig.json`,
   `src/index.ts` placeholder) that later pages fill with entities/interfaces.
5. `apps/controller` — empty Node/TS package skeleton (no server code yet).
6. `apps/mobile` — scaffold via `npx create-expo-app` (TypeScript template),
   adjusted to fit workspace conventions.
7. Root ESLint (flat config) + Prettier config shared across workspaces.
8. Root Vitest config wired to run across all workspace packages.
9. `.env.example` at repo root documenting controller env vars anticipated
   so far (PORT, DATA_DIR, LOG_LEVEL, PAIRING_TOKEN_TTL) — values, not
   secrets.
10. Root `README.md` — project overview + pointer to `.claude/README.md`.
11. `scripts/` — placeholder for later dev/setup scripts (empty with .gitkeep
    or a trivial `check-env.ts` that just validates Node version).

# Files Changed
New repo-root files/dirs only: `.gitignore`, `package.json`,
`tsconfig.base.json`, `.eslintrc`/`eslint.config.js`, `.prettierrc`,
`vitest.config.ts` (root), `.env.example`, `README.md`,
`packages/shared/*`, `apps/controller/package.json` + `tsconfig.json`,
`apps/mobile/*` (Expo scaffold), `scripts/*`.

# Tests
- `npm install` succeeds at the root.
- `npm run lint` and `npm run typecheck` succeed (even with near-empty
  packages).
- `npm test` runs Vitest and reports "no tests found" cleanly (not an error)
  or one trivial smoke test per package.
- `npx expo-doctor` (or equivalent) passes for `apps/mobile`.

# Acceptance Criteria
- [ ] Repo is a git repository with a sensible initial commit boundary
      (this page = one logical commit, left for the user to make/approve).
- [ ] `npm install`, lint, typecheck, and test all succeed from repo root.
- [ ] `apps/mobile` boots via `npx expo start` to the default template screen.
- [ ] No controller/business logic exists yet — this page is scaffolding
      only, per the "implement only that page" rule.
- [ ] `.claude/PROGRESS.md` updated to mark page1 complete and page2 as next.

# Risks
- Expo scaffold pulls a large dependency tree; keep it isolated to
  `apps/mobile` so it doesn't bloat the controller's install.
- TS project references + npm workspaces interplay can be fiddly; validate
  with a trivial cross-package import (`apps/controller` importing a
  placeholder export from `packages/shared`) before calling this page done.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page2.md` written (packages/protocol & packages/config)
      before starting page2's implementation
