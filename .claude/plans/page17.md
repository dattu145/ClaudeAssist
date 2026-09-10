# Page 17: Mobile Foundation

# Objective
Turn the page1 Expo scaffold into a navigable app: file-based navigation
(Expo Router), a pairing screen (the only thing an unpaired device can see),
secure token/URL storage, and a visible connection-state indicator. No real
dashboard data yet — that's page18. Every screen here is a placeholder
proving the shell works end-to-end.

# Design
- **Navigation**: `expo-router` (file-based, Expo's current recommended
  approach — avoids hand-wiring `@react-navigation` stack/tab navigators).
  `app/_layout.tsx` is the root: wraps a `ConnectionProvider` and gates
  everything behind pairing state — unpaired shows only `app/pairing.tsx`;
  paired shows the `(tabs)` group (Dashboard, Projects, Sessions, Settings —
  matching 4 of the spec's 8 dashboard sections; Session Detail/Task
  History/Events are reached by drilling in, page18).
- **Storage**: `expo-secure-store` for both the pairing token (sensitive)
  and the controller base URL (not sensitive, but SecureStore already
  covers it — not worth a second storage dependency for one string, per the
  project's anti-overengineering stance).
- **Pairing screen**: two fields (controller base URL, pairing code),
  calls `POST {baseUrl}/pairing/exchange` (validated against
  `@claudeops/protocol`'s `ExchangePairingCodeRequestSchema`/
  `PairingTokenResponseSchema` — the monorepo lets mobile import the same
  types the controller defines), persists the result via `ConnectionProvider
  .pair()`, and only then reveals the tab group.
- **Connection-state indicator**: `ConnectionProvider` (React context)
  polls `GET {baseUrl}/health` on a bounded interval (default 15s, cleared
  on unmount — the spec explicitly forbids uncontrolled polling loops) and
  exposes `status: "checking" | "connected" | "disconnected"`. Rendered as
  a small badge in every screen's header (visible foreground connection
  state, per architecture/mobile.md and the spec's ANDROID BACKGROUND
  ARCHITECTURE section — this page does not attempt any background
  polling, foreground-only). WebSocket-based live status is deferred to
  page18, when there's real dashboard data to justify opening it.
- **Settings screen** gets a "forget this device" action (clears stored
  token/URL, returns to the pairing screen) — the natural place for it,
  and trivial now that `ConnectionProvider` exists.

# Implementation
1. `npx expo install expo-router react-native-safe-area-context
   react-native-screens expo-linking expo-constants expo-secure-store` —
   versions resolved for the installed Expo SDK (57), not hand-picked.
2. `package.json` — `"main": "expo-router/entry"`; `app.json` — `"scheme"`
   for expo-router deep linking, typed routes experiment left off (not
   needed for this page's scope).
3. `lib/storage.ts` — thin wrapper over `expo-secure-store` (`getToken`,
   `setToken`, `getBaseUrl`, `setBaseUrl`, `clear`) — one place, not
   `SecureStore` calls scattered through screens.
4. `lib/connection-context.tsx` — `ConnectionProvider`/`useConnection()`:
   loads stored credentials on mount, exposes `isPaired`, `status`,
   `pair(baseUrl, code)`, `forget()`.
5. `app/_layout.tsx` — wraps `ConnectionProvider`; renders `app/pairing.tsx`
   when `!isPaired`, the `(tabs)` group otherwise.
6. `app/pairing.tsx` — the two-field form described above.
7. `app/(tabs)/_layout.tsx` — bottom tab navigator (Dashboard, Projects,
   Sessions, Settings), each screen's header showing the connection badge.
8. `app/(tabs)/{index,projects,sessions,settings}.tsx` — placeholder
   screens ("Coming in page18" for the first three); Settings shows the
   connection status and the "forget this device" button for real.
9. `components/ConnectionBadge.tsx` — small reusable status indicator.

# Files Changed
New: `apps/mobile/{app/_layout.tsx, app/pairing.tsx,
app/(tabs)/{_layout,index,projects,sessions,settings}.tsx, lib/storage.ts,
lib/connection-context.tsx, components/ConnectionBadge.tsx}`. Modified:
`apps/mobile/package.json`, `apps/mobile/app.json`.

# Tests
Mobile has no device/simulator available in this environment (documented
limitation, same as page1) — verified via: `expo-doctor` (structural
health), TypeScript (`tsc --noEmit`), and Metro bundler boot (`expo start`,
confirms the app actually compiles and the router resolves every route
file without crashing) — the same verification method page1 used
successfully. No unit test framework wired for mobile yet (out of scope —
nothing here has business logic worth unit-testing beyond what a bundler
boot + typecheck already catches; `lib/storage.ts`'s thin wrapper is the
only candidate, and it's a direct passthrough to `expo-secure-store`).

# Acceptance Criteria
- [ ] `expo-doctor` passes.
- [ ] `tsc --noEmit` passes with no errors.
- [ ] Metro bundler boots cleanly and resolves every route.
- [ ] An unpaired app can reach only the pairing screen; a successful
      pairing reveals the tab group; "forget this device" returns to
      pairing — verified by reading the gating logic, since there's no
      simulator to click through (documented limitation).
- [ ] The connection poll interval is bounded and cleared on unmount — no
      uncontrolled polling loop.
- [ ] `.claude/PROGRESS.md` updated.

# Risks
- No real device/simulator testing is possible in this environment — the
  same limitation page1 already documented. Bundler-boot + typecheck
  verification is real but not a substitute for an actual tap-through;
  flagged, not hidden.
- `expo-router`'s exact API surface depends on the installed SDK 57
  version — installed via `expo install` (version-matched), not
  hand-picked, to avoid a version-skew class of bug.

# Completion Checklist
- [ ] All Acceptance Criteria checked
- [ ] `.claude/CHANGELOG.md` entry added
- [ ] `.claude/PROGRESS.md` updated
- [ ] `.claude/plans/page18.md` written (mobile dashboard + real data)
      before starting page18
