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
import { getCurrentLocation, getSavedLocation } from "../../services/location";
import type { Mosque } from "@live-azan/shared";

type ViewMode = "list" | "map";

function deduplicateMosques(mosques: Mosque[]): Mosque[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  return mosques.filter((m) => {
    if (seenIds.has(m.id)) return false;
    seenIds.add(m.id);
    const key = `${m.name.toLowerCase().trim()}_${(m.city || "").toLowerCase()}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

export default function MosquesScreen() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const { nearbyMosques, uncoveredArea, isLoading, fetchNearbyMosques, requestCoverage } = useMosqueStore();

  const loadMosques = useCallback(async () => {
    // Use saved location immediately for instant render
    const saved = await getSavedLocation();
    if (saved) {
      setUserLocation(saved);
      fetchNearbyMosques(saved.latitude, saved.longitude);
    }

    // Get live GPS in parallel (may be instant via getLastKnownPositionAsync)
    try {
      const live = await getCurrentLocation();
      setUserLocation(live);
      // Only re-fetch if location changed meaningfully (>0.5km)
      if (!saved || Math.abs(live.latitude - saved.latitude) > 0.005 || Math.abs(live.longitude - saved.longitude) > 0.005) {
        fetchNearbyMosques(live.latitude, live.longitude);
      }
    } catch {
      // Location unavailable — saved location already shown
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

  const displayMosques = deduplicateMosques(nearbyMosques);

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

      {viewMode === "list" && (
        <FlatList
          data={displayMosques}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MosqueCard mosque={item} onPress={() => handleMosquePress(item)} />
          )}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            isLoading ? (
              <View style={styles.loadingBar}>
                <ActivityIndicator size="small" color="#1B5E20" />
                <Text style={styles.loadingText}>Updating…</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            isLoading ? null : (
              <View style={styles.emptyState}>
                <Ionicons name="business-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No mosques found nearby</Text>
              </View>
            )
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

      {viewMode === "map" && userLocation && (
        <MosqueMap
          mosques={displayMosques}
          userLocation={userLocation}
          onMosquePress={handleMosquePress}
        />
      )}

      {viewMode === "map" && !userLocation && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1B5E20" />
          <Text style={styles.loadingText}>Getting location…</Text>
        </View>
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
  loadingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: "#999",
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
