import { StyleSheet, Text, View } from "react-native";
import { useConnection, type ConnectionStatus } from "../lib/connection-context";

const LABEL: Record<ConnectionStatus, string> = {
  checking: "Checking…",
  connected: "Connected",
  disconnected: "Disconnected",
};

const COLOR: Record<ConnectionStatus, string> = {
  checking: "#9CA3AF",
  connected: "#16A34A",
  disconnected: "#DC2626",
};

/** Visible foreground connection-state indicator (architecture/mobile.md,
 * spec's ANDROID BACKGROUND ARCHITECTURE section — foreground-only, no
 * background polling claimed). */
export function ConnectionBadge() {
  const { status } = useConnection();

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: COLOR[status] }]} />
      <Text style={styles.label}>{LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    color: "#374151",
  },
});
