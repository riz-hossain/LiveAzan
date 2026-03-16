import { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Prayer } from "@live-azan/shared";
import { deduplicateMosques } from "./mosques";
import { PrayerTimeCard } from "../../components/PrayerTimeCard";
import { IqamaCountdown } from "../../components/IqamaCountdown";
import { MosqueCard } from "../../components/MosqueCard";
import { usePrayerStore } from "../../stores/prayerStore";
import { useMosqueStore } from "../../stores/mosqueStore";
import { getCurrentLocation, getSavedLocation } from "../../services/location";

const PRAYER_ORDER: Prayer[] = [
  Prayer.FAJR,
  Prayer.DHUHR,
  Prayer.ASR,
  Prayer.MAGHRIB,
  Prayer.ISHA,
];

const PRAYER_LABELS: Record<Prayer, string> = {
  [Prayer.FAJR]: "Fajr",
  [Prayer.DHUHR]: "Dhuhr",
  [Prayer.ASR]: "Asr",
  [Prayer.MAGHRIB]: "Maghrib",
  [Prayer.ISHA]: "Isha",
  [Prayer.JUMMAH]: "Jummah",
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const {
    prayerTimes,
    nextPrayer,
    fetchPrayerTimes,
    updateNextPrayer,
    isLoading: prayerLoading,
  } = usePrayerStore();
  const {
    primaryMosque,
    iqamaSchedule,
    nearbyMosques,
    fetchIqamaSchedule,
    fetchNearbyMosques,
    isDiscovering,
  } = useMosqueStore();

  const loadData = useCallback(async () => {
    // Try saved location first for instant render
    const saved = await getSavedLocation();
    if (saved) {
      fetchPrayerTimes(saved.latitude, saved.longitude);
      fetchNearbyMosques(saved.latitude, saved.longitude);
      if (primaryMosque) {
        fetchIqamaSchedule(primaryMosque.id);
      }
      updateNextPrayer();
    }

    // Get live GPS (may be instant via getLastKnownPositionAsync)
    try {
      const location = await getCurrentLocation();
      const needsRefresh = !saved ||
        Math.abs(location.latitude - saved.latitude) > 0.005 ||
        Math.abs(location.longitude - saved.longitude) > 0.005;

      if (needsRefresh) {
        await fetchPrayerTimes(location.latitude, location.longitude);
        fetchNearbyMosques(location.latitude, location.longitude);
      }
      if (primaryMosque) {
        await fetchIqamaSchedule(primaryMosque.id);
      }
      updateNextPrayer();
    } catch {
      // Location or API error — saved location data already shown
    }
  }, [primaryMosque]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => updateNextPrayer(), 60_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const getPrayerTime = (prayer: Prayer): string | undefined => {
    if (!prayerTimes) return undefined;
    const key = prayer.toLowerCase() as keyof typeof prayerTimes;
    const value = prayerTimes[key];
    return typeof value === "string" ? value : undefined;
  };

  const getIqamaTime = (prayer: Prayer): string | undefined => {
    const entry = iqamaSchedule.find((s) => s.prayer === prayer);
    return entry?.iqamaTime;
  };

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Top 3 nearby mosques for quick access — deduplicate first so same
  // physical mosque with multiple data-source entries shows only once
  const nearbyPreview = deduplicateMosques(nearbyMosques).slice(0, 3);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#1B5E20"
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.date}>{today}</Text>
        {primaryMosque && (
          <Text style={styles.mosque}>{primaryMosque.name}</Text>
        )}
      </View>

      {nextPrayer && primaryMosque && (
        <IqamaCountdown
          prayerName={PRAYER_LABELS[nextPrayer.prayer]}
          iqamaTime={getIqamaTime(nextPrayer.prayer) || nextPrayer.time}
          mosqueName={primaryMosque.name}
        />
      )}

      <View style={styles.prayerList}>
        {PRAYER_ORDER.map((prayer) => (
          <PrayerTimeCard
            key={prayer}
            prayerName={PRAYER_LABELS[prayer]}
            adhanTime={getPrayerTime(prayer)}
            iqamaTime={getIqamaTime(prayer)}
            isNext={nextPrayer?.prayer === prayer}
          />
        ))}
      </View>

      {!prayerTimes && !prayerLoading && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Enable location access to see prayer times for your area.
          </Text>
        </View>
      )}

      {/* Nearby Mosques section */}
      <View style={styles.nearbySection}>
        <View style={styles.nearbySectionHeader}>
          <Text style={styles.nearbySectionTitle}>Nearby Mosques</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/mosques")}>
            <Text style={styles.seeAllText}>See all</Text>
          </TouchableOpacity>
        </View>

        {nearbyPreview.length > 0 ? (
          <View style={styles.nearbyList}>
            {nearbyPreview.map((mosque) => (
              <MosqueCard
                key={mosque.id}
                mosque={mosque}
                onPress={() => router.push(`/mosque/${mosque.id}`)}
              />
            ))}
          </View>
        ) : isDiscovering ? (
          <View style={styles.nearbyLoading}>
            <ActivityIndicator size="small" color="#1B5E20" />
            <Text style={styles.nearbyLoadingText}>Finding mosques near you…</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.findButton}
            onPress={() => router.push("/(tabs)/mosques")}
          >
            <Ionicons name="search" size={18} color="#fff" />
            <Text style={styles.findButtonText}>Find Nearby Mosques</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  date: {
    fontSize: 16,
    color: "#666",
  },
  mosque: {
    fontSize: 14,
    color: "#1B5E20",
    marginTop: 2,
    fontWeight: "500",
  },
  prayerList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
  },
  nearbySection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  nearbySectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  nearbySectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  seeAllText: {
    fontSize: 14,
    color: "#1B5E20",
    fontWeight: "500",
  },
  nearbyList: {
    gap: 8,
  },
  nearbyLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  nearbyLoadingText: {
    fontSize: 14,
    color: "#999",
  },
  findButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B5E20",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  findButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
