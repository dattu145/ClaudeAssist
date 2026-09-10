import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { ClaudeSession } from "@claudeops/protocol";
import { useApiClient } from "../../lib/use-api-client";

export default function SessionsScreen() {
  const api = useApiClient();
  const router = useRouter();
  const [sessions, setSessions] = useState<ClaudeSession[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) {
      return;
    }
    try {
      setError(null);
      setSessions(await api.listSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions.");
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (sessions === null) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={sessions.length === 0 ? styles.emptyList : undefined}
        ListEmptyComponent={<Text style={styles.subtitle}>No sessions yet. Tap + to start one.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => router.push(`/session/${item.id}`)}>
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>{item.currentTask ?? item.id}</Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>
                {item.lastOutput ?? "No output yet"}
              </Text>
            </View>
            <Text style={styles.badge}>{item.status}</Text>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={styles.fab} onPress={() => router.push("/session/new")}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyList: { flex: 1, alignItems: "center", justifyContent: "center" },
  subtitle: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  error: { fontSize: 14, color: "#DC2626", textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  rowMain: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  badge: { fontSize: 12, color: "#6B7280", textTransform: "uppercase" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  fabText: { color: "#fff", fontSize: 28, lineHeight: 30 },
});
