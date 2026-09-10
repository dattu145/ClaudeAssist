import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ConnectionProvider, useConnection } from "../lib/connection-context";

/**
 * Gates the whole app on pairing state: an unpaired device can reach only
 * `pairing.tsx`; a paired one reaches the `(tabs)` group. No splash screen
 * yet (page17 is foundation-only) — a blank frame during the brief
 * SecureStore read is an acceptable placeholder.
 */
function RootNavigator() {
  const { isLoading, isPaired } = useConnection();

  if (isLoading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Stack.Protected (not a plain ternary + Fragment) — this
       * expo-router version's Stack only recognizes Stack.Screen/
       * Stack.Protected/Stack.Header as direct children; a bare
       * Fragment of multiple Screens hits its "unknown child" path and
       * crashes trying to stringify the Fragment's Symbol type. */}
      <Stack.Protected guard={isPaired}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="project/[id]" options={{ headerShown: true, title: "Project" }} />
        <Stack.Screen name="project/new" options={{ headerShown: true, title: "New Project" }} />
        <Stack.Screen name="session/[id]" options={{ headerShown: true, title: "Session" }} />
        <Stack.Screen name="session/new" options={{ headerShown: true, title: "New Session" }} />
      </Stack.Protected>
      <Stack.Protected guard={!isPaired}>
        <Stack.Screen name="pairing" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ConnectionProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </ConnectionProvider>
    </SafeAreaProvider>
  );
}
