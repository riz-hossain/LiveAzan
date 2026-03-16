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
import { PrayerTimeCard } from "../../components/PrayerTimeCard";
import { IqamaCountdown } from "../../components/IqamaCountdown";
import { usePrayerStore } from "../../stores/prayerStore";
import { useMosqueStore } from "../../stores/mosqueStore";
import { getCurrentLocation } from "../../services/location";

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
    fetchIqamaSchedule,
    discoverIqamaNearby,
    isDiscovering,
  } = useMosqueStore();

  const [discoverDone, setDiscoverDone] = useState(false);
  const [mosqueCount, setMosqueCount] = useState(0);
  const [iqamaCount, setIqamaCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const location = await getCurrentLocation();
      await fetchPrayerTimes(location.latitude, location.longitude);
      if (primaryMosque) {
        await fetchIqamaSchedule(primaryMosque.id);
      }
      updateNextPrayer();
    } catch {
      // Location or API error
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

  const handleFindIqama = async () => {
    try {
      const location = await getCurrentLocation();
      const discovered = await discoverIqamaNearby(
        location.latitude,
        location.longitude
      );
      const withIqama = discovered.filter(
        (m) => m.discoveredIqama && Object.keys(m.discoveredIqama).length > 0
      );
      setMosqueCount(discovered.length);
      setIqamaCount(withIqama.length);
      setDiscoverDone(true);
      // Navigate to mosques tab to show results
      router.push("/(tabs)/mosques");
    } catch {
      // ignore
    }
  };

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

      {/* Find Iqama Near Me — shown when no primary mosque or as a discovery CTA */}
      {!primaryMosque && (
        <View style={styles.discoverCard}>
          <Ionicons name="location" size={28} color="#1B5E20" />
          <Text style={styles.discoverTitle}>Find Iqama Times Near You</Text>
          <Text style={styles.discoverBody}>
            LiveAzan searches MAWAQIT and mosque websites to find iqama
            schedules for mosques near you — automatically, no sign-up needed.
          </Text>
          <TouchableOpacity
            style={styles.discoverButton}
            onPress={handleFindIqama}
            disabled={isDiscovering}
          >
            {isDiscovering ? (
              <View style={styles.discoverButtonInner}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.discoverButtonText}>Searching…</Text>
              </View>
            ) : (
              <View style={styles.discoverButtonInner}>
                <Ionicons name="search" size={18} color="#fff" />
                <Text style={styles.discoverButtonText}>Find Nearby Mosques</Text>
              </View>
            )}
          </TouchableOpacity>
          {discoverDone && (
            <Text style={styles.discoverResult}>
              Found {mosqueCount} mosques · {iqamaCount} with iqama times
            </Text>
          )}
        </View>
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
  discoverCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  discoverTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#222",
    textAlign: "center",
  },
  discoverBody: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  discoverButton: {
    backgroundColor: "#1B5E20",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  discoverButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  discoverButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  discoverResult: {
    fontSize: 13,
    color: "#1B5E20",
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
});
