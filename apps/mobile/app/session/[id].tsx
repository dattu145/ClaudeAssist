import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { DOMAIN_EVENT_TO_WS_TYPE, type ClaudeSession, type Task } from "@claudeops/protocol";
import { useApiClient } from "../../lib/use-api-client";
import { useConnection } from "../../lib/connection-context";
import { useLiveEvents } from "../../lib/use-live-events";

const wsTypeToLabel = new Map(
  Object.entries(DOMAIN_EVENT_TO_WS_TYPE).map(([domainType, wsType]) => [
    wsType,
    domainType.replace(/_/g, " ").toLowerCase(),
  ])
);

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApiClient();
  const { baseUrl, token } = useConnection();
  const [session, setSession] = useState<ClaudeSession | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [actionInFlight, setActionInFlight] = useState(false);
  const { events } = useLiveEvents(baseUrl, token, id);

  const load = useCallback(async () => {
    if (!api || !id) {
      return;
    }
    try {
      setError(null);
      const [s, t] = await Promise.all([api.getSession(id), api.listSessionTasks(id)]);
      setSession(s);
      setTasks(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session.");
    }
  }, [api, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // Live status/output changes for this session arrive over the WS
  // stream too — re-fetch the session record whenever one lands so the
  // header (status, currentTask, lastOutput) doesn't go stale between
  // pull-to-refreshes.
  const eventCount = events.length;
  useFocusEffect(
    useCallback(() => {
      if (eventCount > 0) {
        void load();
      }
    }, [eventCount, load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const runAction = async (action: (client: NonNullable<typeof api>) => Promise<unknown>, failureTitle: string) => {
    if (actionInFlight || !api) {
      return;
    }
    setActionInFlight(true);
    try {
      await action(api);
      await load();
    } catch (err) {
      Alert.alert(failureTitle, err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setActionInFlight(false);
    }
  };

  const onSendInstruction = () => {
    if (!api || !id || !instruction.trim()) {
      return;
    }
    const text = instruction.trim();
    void runAction(async (client) => {
      await client.sendInstruction(id, text);
      setInstruction("");
    }, "Failed to send instruction");
  };

  if (!session) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={[...tasks].reverse()}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.status}>{session.status}</Text>
            {session.currentTask ? <Text style={styles.currentTask}>{session.currentTask}</Text> : null}
            {session.lastOutput ? <Text style={styles.output}>{session.lastOutput}</Text> : null}
            {session.lastError ? <Text style={styles.errorText}>{session.lastError}</Text> : null}

            <View style={styles.actionsRow}>
              <ActionButton
                label="Resume"
                disabled={actionInFlight}
                onPress={() => runAction((client) => client.resumeSession(id), "Failed to resume session")}
              />
              <ActionButton
                label="Stop"
                disabled={actionInFlight}
                onPress={() => runAction((client) => client.stopSession(id), "Failed to stop session")}
              />
              <ActionButton
                label="Cancel"
                disabled={actionInFlight}
                onPress={() => runAction((client) => client.cancelLatestTask(id), "Failed to cancel task")}
              />
            </View>

            <View style={styles.instructionRow}>
              <TextInput
                style={styles.instructionInput}
                placeholder="Send an instruction..."
                value={instruction}
                onChangeText={setInstruction}
              />
              <TouchableOpacity
                style={[styles.sendButton, (!instruction.trim() || actionInFlight) && styles.buttonDisabled]}
                onPress={onSendInstruction}
                disabled={!instruction.trim() || actionInFlight}
              >
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Live Activity</Text>
            {events.length === 0 ? (
              <Text style={styles.subtitle}>No live events yet.</Text>
            ) : (
              [...events]
                .reverse()
                .slice(0, 10)
                .map((e, i) => (
                  <View key={`${e.timestamp}-${i}`} style={styles.eventRow}>
                    <Text style={styles.eventType}>{wsTypeToLabel.get(e.type) ?? e.type}</Text>
                    <Text style={styles.eventTime}>{new Date(e.timestamp).toLocaleTimeString()}</Text>
                  </View>
                ))
            )}

            <Text style={styles.sectionTitle}>Task History</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.subtitle}>No tasks yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.taskRow}>
            <Text style={styles.taskInstruction} numberOfLines={2}>
              {item.instruction}
            </Text>
            <Text style={styles.badge}>{item.status}</Text>
          </View>
        )}
      />
    </View>
  );
}

function ActionButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <TouchableOpacity style={[styles.actionButton, disabled && styles.buttonDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.actionButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  subtitle: { fontSize: 14, color: "#6B7280" },
  error: { fontSize: 14, color: "#DC2626", textAlign: "center" },
  errorText: { fontSize: 13, color: "#DC2626", marginTop: 8 },
  header: { padding: 16 },
  status: { fontSize: 20, fontWeight: "700" },
  currentTask: { fontSize: 14, color: "#374151", marginTop: 4 },
  output: {
    fontSize: 13,
    color: "#374151",
    marginTop: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 12,
  },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  actionButton: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  actionButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  buttonDisabled: { opacity: 0.5 },
  instructionRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  instructionInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginTop: 24, marginBottom: 8 },
  eventRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  eventType: { fontSize: 13, textTransform: "capitalize" },
  eventTime: { fontSize: 12, color: "#9CA3AF" },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  taskInstruction: { fontSize: 14, flex: 1, marginRight: 12 },
  badge: { fontSize: 12, color: "#6B7280", textTransform: "uppercase" },
});
