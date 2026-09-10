import { useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { useApiClient } from "../../lib/use-api-client";

export default function NewProjectScreen() {
  const api = useApiClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = name.trim().length > 0 && path.trim().length > 0 && !isSubmitting;

  const onSubmit = async () => {
    if (!api) {
      return;
    }
    setIsSubmitting(true);
    try {
      const project = await api.createProject({ name: name.trim(), path: path.trim() });
      router.replace(`/project/${project.id}`);
    } catch (err) {
      Alert.alert("Failed to create project", err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} placeholder="My Project" value={name} onChangeText={setName} />

      <Text style={styles.label}>Path</Text>
      <TextInput
        style={styles.input}
        placeholder="C:\path\to\project"
        autoCapitalize="none"
        autoCorrect={false}
        value={path}
        onChangeText={setPath}
      />

      <TouchableOpacity style={[styles.button, !canSubmit && styles.buttonDisabled]} onPress={onSubmit} disabled={!canSubmit}>
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Project</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#fff" },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
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
