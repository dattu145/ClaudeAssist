# ClaudeOps

Personal AI operations system for controlling Claude Code projects/sessions —
starting with a local Session Controller and an Expo dashboard client.

Start with [`.claude/README.md`](.claude/README.md) for the documentation
system (architecture, decisions, roadmap, progress).

## Layout
- `apps/controller` — Node/TypeScript controller daemon (owns all Claude Code
  process management).
- `apps/mobile` — Expo/React Native dashboard client.
- `packages/shared` — shared domain types/interfaces.
- `packages/protocol` — Zod schemas for REST/WS wire types (later page).
- `packages/config` — env schema/config loading (later page).
- `packages/logging` — structured logging (later page).

## Setup
```
npm install
cp .env.example .env
npm run typecheck
npm run lint
npm test
```

Mobile: `cd apps/mobile && npx expo start`.
