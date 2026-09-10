import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { Project } from "@claudeops/protocol";
import { useApiClient } from "../../lib/use-api-client";

export default function NewSessionScreen() {
  const { projectId: preselectedProjectId } = useLocalSearchParams<{ projectId?: string }>();
  const api = useApiClient();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(preselectedProjectId ?? null);
  const [instruction, setInstruction] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) {
      return;
    }
    try {
      setError(null);
      const list = await api.listProjects();
      setProjects(list);
      if (!projectId && list.length > 0) {
        setProjectId(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects.");
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const canSubmit = Boolean(projectId) && !isSubmitting;

  const onSubmit = async () => {
    if (!api || !projectId) {
      return;
    }
    setIsSubmitting(true);
    try {
      const session = await api.startSession({
        projectId,
        ...(instruction.trim() ? { initialInstruction: instruction.trim() } : {}),
      });
      router.replace(`/session/${session.id}`);
    } catch (err) {
      Alert.alert("Failed to start session", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (projects === null) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  if (projects.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.subtitle}>Create a project first before starting a session.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.label}>Project</Text>
        {projects.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.projectRow, projectId === p.id && styles.projectRowSelected]}
            onPress={() => setProjectId(p.id)}
          >
            <Text style={styles.projectRowText}>{p.name}</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Initial instruction (optional)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="What should Claude do first?"
          multiline
          value={instruction}
          onChangeText={setInstruction}
        />

        <TouchableOpacity style={[styles.button, !canSubmit && styles.buttonDisabled]} onPress={onSubmit} disabled={!canSubmit}>
          {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Start Session</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scroll: { padding: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  subtitle: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  error: { fontSize: 14, color: "#DC2626", textAlign: "center" },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 8 },
  projectRow: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  projectRowSelected: { borderColor: "#111827", backgroundColor: "#F3F4F6" },
  projectRowText: { fontSize: 15 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  button: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
