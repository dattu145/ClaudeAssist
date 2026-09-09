# Mobile Client

Expo + React Native + TypeScript, `apps/mobile`, dashboard-only in Phase 1.

## Screens
Dashboard, Projects (list/detail), Sessions (list/detail), Task history,
Events/activity, Settings, Connection status (pairing).

## Networking
- REST client for commands/queries, generated/typed from `packages/protocol`
  Zod schemas shared with the controller (single source of truth for request/
  response shapes — no hand-duplicated types).
- WS client for the versioned realtime protocol (architecture/event-system.md),
  with reconnect/backoff and a visible connection-state indicator (spec
  requirement: "implement visible foreground connection state").
- No microphone, no background service, no voice in Phase 1 (see
  research/android-background.md).

## Pairing
On first launch, user enters/scans the pairing code the controller prints on
startup (see SECURITY.md); the resulting token is stored via Expo SecureStore,
never in plain AsyncStorage, and never checked into source.
