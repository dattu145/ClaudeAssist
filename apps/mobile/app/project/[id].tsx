import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { ClaudeSession, Project } from "@claudeops/protocol";
import { useApiClient } from "../../lib/use-api-client";

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApiClient();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<ClaudeSession[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api || !id) {
      return;
    }
    try {
      setError(null);
      const [p, s] = await Promise.all([api.getProject(id), api.listSessions(id)]);
      setProject(p);
      setSessions(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project.");
    }
  }, [api, id]);

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

  if (!project || sessions === null) {
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
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{project.name}</Text>
            <Text style={styles.subtitle}>{project.path}</Text>
            <Text style={styles.sectionTitle}>Sessions</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.subtitle}>No sessions yet.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => router.push(`/session/${item.id}`)}>
            <Text style={styles.rowTitle}>{item.currentTask ?? item.id}</Text>
            <Text style={styles.badge}>{item.status}</Text>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={styles.fab} onPress={() => router.push(`/session/new?projectId=${project.id}`)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { fontSize: 14, color: "#DC2626", textAlign: "center" },
  header: { padding: 16 },
  title: { fontSize: 20, fontWeight: "700" },
  subtitle: { fontSize: 14, color: "#6B7280", marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginTop: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  rowTitle: { fontSize: 16, fontWeight: "600" },
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
