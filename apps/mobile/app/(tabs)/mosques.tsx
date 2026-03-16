import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { MosqueCard } from "../../components/MosqueCard";
import { MosqueMap } from "../../components/MosqueMap";
import { DebugPanel } from "../../components/DebugPanel";
import { useMosqueStore } from "../../stores/mosqueStore";
import { getCurrentLocation } from "../../services/location";
import type { Mosque } from "@live-azan/shared";

type ViewMode = "list" | "map";

export default function MosquesScreen() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const { nearbyMosques, uncoveredArea, isLoading, fetchNearbyMosques, requestCoverage } = useMosqueStore();

  const loadMosques = useCallback(async () => {
    try {
      const location = await getCurrentLocation();
      setUserLocation(location);
      await fetchNearbyMosques(location.latitude, location.longitude);
    } catch {
      // Location unavailable
    }
  }, []);

  useEffect(() => {
    loadMosques();
  }, [loadMosques]);

  const handleMosquePress = (mosque: Mosque) => {
    router.push(`/mosque/${mosque.id}`);
  };

  const handleRequestCoverage = async () => {
    if (!userLocation) return;
    try {
      await requestCoverage(userLocation.latitude, userLocation.longitude);
    } catch {
      // Error handled in store
    }
  };

  return (
    <View style={styles.container}>
      <DebugPanel lat={userLocation?.latitude ?? null} lon={userLocation?.longitude ?? null} />
      <View style={styles.toggleBar}>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === "list" && styles.toggleActive]}
          onPress={() => setViewMode("list")}
        >
          <Ionicons
            name="list"
            size={20}
            color={viewMode === "list" ? "#fff" : "#1B5E20"}
          />
          <Text style={[styles.toggleText, viewMode === "list" && styles.toggleTextActive]}>
            List
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === "map" && styles.toggleActive]}
          onPress={() => setViewMode("map")}
        >
          <Ionicons
            name="map"
            size={20}
            color={viewMode === "map" ? "#fff" : "#1B5E20"}
          />
          <Text style={[styles.toggleText, viewMode === "map" && styles.toggleTextActive]}>
            Map
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1B5E20" />
        </View>
      )}

      {!isLoading && viewMode === "list" && (
        <FlatList
          data={nearbyMosques}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MosqueCard mosque={item} onPress={() => handleMosquePress(item)} />
          )}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="business-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No mosques found nearby</Text>
            </View>
          }
          ListFooterComponent={
            uncoveredArea ? (
              <TouchableOpacity style={styles.coverageButton} onPress={handleRequestCoverage}>
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={styles.coverageButtonText}>Request coverage for this area</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {!isLoading && viewMode === "map" && userLocation && (
        <MosqueMap
          mosques={nearbyMosques}
          userLocation={userLocation}
          onMosquePress={handleMosquePress}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  toggleBar: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1B5E20",
    gap: 6,
  },
  toggleActive: {
    backgroundColor: "#1B5E20",
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1B5E20",
  },
  toggleTextActive: {
    color: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 16,
    gap: 8,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
  },
  coverageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E65100",
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  coverageButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
