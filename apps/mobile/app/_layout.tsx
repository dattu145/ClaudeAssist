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
      {isPaired ? <Stack.Screen name="(tabs)" /> : <Stack.Screen name="pairing" />}
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
