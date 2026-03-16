import React, { useEffect, useState, useCallback } from "react";
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

// Prevent a react-native-maps crash (e.g. missing Google Maps API key on Android)
// from taking down the whole screen.
class MapErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false };
  componentDidCatch() {
    this.setState({ crashed: true });
  }
  render() {
    if (this.state.crashed) {
      return (
        <View style={mapErrorStyles.container}>
          <Ionicons name="map-outline" size={48} color="#ccc" />
          <Text style={mapErrorStyles.text}>Map unavailable on this device</Text>
          <Text style={mapErrorStyles.sub}>Use the list view to browse mosques</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const mapErrorStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#f5f5f5",
  },
  text: { fontSize: 16, color: "#999" },
  sub: { fontSize: 13, color: "#bbb" },
});

type ViewMode = "list" | "map";

/**
 * Deduplicate mosques by ID, then by name+city, then by proximity.
 * Mosques within 200 m of each other are considered the same physical location;
 * we keep the most data-rich entry (verified > has iqama > most fields filled).
 */
export function deduplicateMosques(mosques: Mosque[]): Mosque[] {
  const seenIds = new Set<string>();
  const deduped: Mosque[] = [];

  for (const m of mosques) {
    if (seenIds.has(m.id)) continue;
    seenIds.add(m.id);

    // Check if a nearby mosque is already in the result list (within 200 m)
    const nearbyIdx = deduped.findIndex(
      (d) => haversineM(d.latitude, d.longitude, m.latitude, m.longitude) < 200
    );

    if (nearbyIdx === -1) {
      deduped.push(m);
    } else {
      // Keep the richer entry
      const existing = deduped[nearbyIdx];
      const existingScore = richness(existing);
      const newScore = richness(m);
      if (newScore > existingScore) {
        deduped[nearbyIdx] = m;
      }
    }
  }

  return deduped;
}

function richness(m: Mosque): number {
  let score = 0;
  if (m.verified) score += 10;
  if (m.iqamaSource && m.iqamaSource !== "manual") score += 5;
  if (m.iqamaSource === "manual") score += 2;
  if (m.phone) score += 1;
  if (m.website) score += 1;
  if (m.description) score += 1;
  return score;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
        <MapErrorBoundary>
          <MosqueMap
            mosques={displayMosques}
            userLocation={userLocation}
            onMosquePress={handleMosquePress}
          />
        </MapErrorBoundary>
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
