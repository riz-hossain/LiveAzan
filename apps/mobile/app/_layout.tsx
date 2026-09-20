import { useEffect } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "../stores/authStore";
import { useMosqueStore } from "../stores/mosqueStore";
import { PageRenderer } from "../components/PageRenderer";

export default function RootLayout() {
  const { user, isGuest, isLoading, loadStoredAuth } = useAuthStore();
  const { loadPrimaryMosque } = useMosqueStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    loadStoredAuth().then(() => loadPrimaryMosque());
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!user && !isGuest && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if ((user || isGuest) && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [user, isGuest, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1B5E20" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Slot />
      {/* Offscreen, shows nothing: it reads the mosque sites whose times a script writes in. */}
      <PageRenderer />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
});
