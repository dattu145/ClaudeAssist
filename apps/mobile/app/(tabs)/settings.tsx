import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useConnection } from "../../lib/connection-context";

const STATUS_LABEL = {
  checking: "Checking…",
  connected: "Connected",
  disconnected: "Disconnected",
} as const;

export default function SettingsScreen() {
  const { baseUrl, status, forget } = useConnection();

  const onForget = () => {
    Alert.alert(
      "Forget this device?",
      "You'll need to pair again with a new code from the controller's log.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Forget", style: "destructive", onPress: () => void forget() },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Controller</Text>
        <Text style={styles.value}>{baseUrl}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Connection</Text>
        <Text style={styles.value}>{STATUS_LABEL[status]}</Text>
      </View>

      <TouchableOpacity style={styles.forgetButton} onPress={onForget}>
        <Text style={styles.forgetButtonText}>Forget this device</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#fff" },
  section: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: "600", color: "#6B7280", marginBottom: 4 },
  value: { fontSize: 16, color: "#111827" },
  forgetButton: {
    marginTop: 24,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#DC2626",
  },
  forgetButtonText: { color: "#DC2626", fontWeight: "600", fontSize: 15 },
});
