import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { DOMAIN_EVENT_TO_WS_TYPE, type ClaudeSession, type Project } from "@claudeops/protocol";
import { useApiClient } from "../../lib/use-api-client";
import { useConnection } from "../../lib/connection-context";
import { useLiveEvents } from "../../lib/use-live-events";

const WAITING_STATUSES = new Set(["WAITING_FOR_INPUT", "WAITING_FOR_PERMISSION"]);

export default function DashboardScreen() {
  const api = useApiClient();
  const { baseUrl, token } = useConnection();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [sessions, setSessions] = useState<ClaudeSession[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { events } = useLiveEvents(baseUrl, token);

  const load = useCallback(async () => {
    if (!api) {
      return;
    }
    try {
      setError(null);
      const [p, s] = await Promise.all([api.listProjects(), api.listSessions()]);
      setProjects(p);
      setSessions(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
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

  const summary = useMemo(() => {
    const activeProjects = projects?.filter((p) => p.status === "active").length ?? 0;
    const working = sessions?.filter((s) => s.status === "WORKING").length ?? 0;
    const waiting = sessions?.filter((s) => WAITING_STATUSES.has(s.status)).length ?? 0;
    const failed = sessions?.filter((s) => s.status === "FAILED").length ?? 0;
    return { activeProjects, working, waiting, failed };
  }, [projects, sessions]);

  const wsTypeToLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const [domainType, wsType] of Object.entries(DOMAIN_EVENT_TO_WS_TYPE)) {
      map.set(wsType, domainType.replace(/_/g, " ").toLowerCase());
    }
    return map;
  }, []);

  if (projects === null || sessions === null) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={[...events].reverse()}
      keyExtractor={(e, i) => `${e.timestamp}-${i}`}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <>
          <View style={styles.summaryRow}>
            <SummaryCard label="Active Projects" value={summary.activeProjects} />
            <SummaryCard label="Working" value={summary.working} />
            <SummaryCard label="Waiting" value={summary.waiting} />
            <SummaryCard label="Failed" value={summary.failed} />
          </View>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
        </>
      }
      ListEmptyComponent={<Text style={styles.subtitle}>No activity yet.</Text>}
      renderItem={({ item }) => (
        <View style={styles.eventRow}>
          <Text style={styles.eventType}>{wsTypeToLabel.get(item.type) ?? item.type}</Text>
          <Text style={styles.eventTime}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
        </View>
      )}
    />
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  subtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", padding: 16 },
  error: { fontSize: 14, color: "#DC2626", textAlign: "center" },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", padding: 12 },
  card: {
    flexBasis: "50%",
    padding: 8,
  },
  cardValue: {
    fontSize: 28,
    fontWeight: "700",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    textAlign: "center",
    paddingTop: 12,
  },
  cardLabel: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    backgroundColor: "#F3F4F6",
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    paddingBottom: 12,
    paddingTop: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
  eventRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  eventType: { fontSize: 14, textTransform: "capitalize" },
  eventTime: { fontSize: 12, color: "#9CA3AF" },
});
