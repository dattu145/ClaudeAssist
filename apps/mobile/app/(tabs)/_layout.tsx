import { Tabs } from "expo-router";
import { ConnectionBadge } from "../../components/ConnectionBadge";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerRight: () => <ConnectionBadge />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="projects" options={{ title: "Projects" }} />
      <Tabs.Screen name="sessions" options={{ title: "Sessions" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
