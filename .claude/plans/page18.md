# Page 18: Mobile Dashboard + Real Data

# Objective
Replace page17's placeholder screens with real data: projects, sessions,
session detail (actions + live output + task history + events), and a
dashboard summary — all backed by the real controller REST API (page6,
page12) and live-updated over WebSocket (page13).

# A real security gap found and fixed before building on it
`attachWebSocketServer` (page13) attaches directly to the raw
`http.Server`'s `upgrade` event via the `ws` library — it never passes
through Express, so page14's `createAuthMiddleware` (mounted on the
Express app) **never runs for WS connections**. Any device on the LAN
could connect to `/ws` and observe all session activity without a token,
undermining the whole pairing model. Found while wiring the mobile app as
the first real WS consumer — fixed now rather than building real mobile
functionality on top of a known-insecure channel:
- `attachWebSocketServer` gains a `pairingRegistry` parameter and a `ws`
  `verifyClient` check: the client must connect to `/ws?token=<token>`
  (React Native's `WebSocket` doesn't support custom headers on connect
  the way `node:ws`'s client does, so a query param is the practical
  choice — same tradeoff most browser-based WS auth uses) and the token
  must verify via `PairingRegistry.verifyToken`. An invalid/missing token
  gets the upgrade rejected (401), never an open socket.
- `lifecycle.ts` passes `pairingRegistry` through.
- Mobile's WS hook appends the stored token to the connection URL.

# Implementation
1. **Controller**: `api/ws/server.ts` — `verifyClient` gate (+ test with a
   real `ws` client asserting a missing/invalid token never completes the
   handshake, and a valid one does). `lifecycle.ts` wiring.
2. **Mobile `lib/api-client.ts`** — a typed REST client: every request/
   response validated against `@claudeops/protocol` schemas (the same
   pattern the controller itself uses — never trust unvalidated JSON from
   the network, in either direction). Covers list/create projects,
   list/start/get sessions, resume/stop/cancel, send instruction, list
   session tasks/events.
3. **Mobile `lib/use-live-events.ts`** — a WS hook: connects (with the
   token query param), optionally subscribes to one session, exposes a
   bounded (last 100) buffer of validated `WsEnvelope`s. Reconnects on
   close with backoff (the app must survive the controller restarting).
4. **Screens**:
   - `app/(tabs)/index.tsx` (Dashboard) — summary counts (active projects,
     working/waiting/failed sessions) computed from real data, plus a
     recent-activity feed fed by the global (unfiltered) WS stream.
   - `app/(tabs)/projects.tsx` — real project list (pull-to-refresh), "+"
     → `app/project/new.tsx`.
   - `app/project/new.tsx` — create-project form (name, path) →
     `POST /projects`.
   - `app/project/[id].tsx` — project detail: its sessions
     (`GET /sessions?projectId=`), "+ New Session" → `app/session/new.tsx`.
   - `app/(tabs)/sessions.tsx` — all sessions, "+" → `app/session/new.tsx`
     (project picker when not pre-selected).
   - `app/session/new.tsx` — start-session form (project picker unless
     pre-filled, optional initial instruction) → `POST /sessions`.
   - `app/session/[id].tsx` — the real session-detail screen: status,
     current task, last output, action buttons (send instruction, resume,
     stop, cancel — each a direct REST call, disabled while in flight),
     task history (`GET /sessions/:id/tasks`), and a live events feed
     (`GET /sessions/:id/events` for history + the WS hook, subscribed to
     this session, for anything after).
5. Root `app/_layout.tsx` gains `session/[id]` and `project/[id]`/
   `project/new` as sibling `Stack.Screen`s alongside `(tabs)`, so drilling
   in from any tab pushes a real stack screen with a back button.

# Files Changed
New: `apps/mobile/lib/{api-client,use-live-events}.ts`,
`apps/mobile/app/project/{new,[id]}.tsx`,
`apps/mobile/app/session/{new,[id]}.tsx`. Modified:
`apps/mobile/app/_layout.tsx`, `apps/mobile/app/(tabs)/{index,projects,
sessions}.tsx`, `apps/controller/src/api/ws/server.ts` (+ its test),
`apps/controller/src/lifecycle.ts`.

# Tests
Controller: `server.test.ts`'s WS suite gains the token-gate cases (real
`ws` client, real `PairingRegistry`). Mobile: no device/simulator
available (documented, same as page1/page17) — verified via `expo-doctor`,
`tsc --noEmit`, and a Metro bundler boot. `npm run typecheck`, `npm run
lint`, `npm test` green from root for the controller-side change.

# Acceptance Criteria
- [x] `/ws` rejects a connection with a missing or invalid token —
      verified by a real test, not just code review.
- [x] Every screen shows real controller data, not placeholder text.
- [x] Every mutating action (start/instruct/resume/stop/cancel/create
      project) goes through the typed, schema-validated API client — no
      raw unvalidated `fetch().json()` in a screen component.
- [x] The WS hook reconnects after a connection drop, with backoff — not
      an immediate tight retry loop.
- [x] All controller tests pass; typecheck and lint clean on both
      workspaces.
- [x] `.claude/PROGRESS.md` updated.

# Risks
- No device/simulator testing in this environment — same documented
  limitation as page1/page17. Screen logic is verified by typecheck +
  bundler boot, not an actual tap-through.
- The WS query-param token means the token can appear in server access
  logs or proxy logs if the controller is ever placed behind one — a
  known tradeoff of query-param WS auth, acceptable for Phase 1's
  LAN-only, no-reverse-proxy deployment model; flagged for whoever adds a
  reverse proxy in front of the controller later.

# Completion Checklist
- [x] All Acceptance Criteria checked
- [x] `.claude/CHANGELOG.md` entry added
- [x] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page19.md` written (NotificationService) before
      starting page19
