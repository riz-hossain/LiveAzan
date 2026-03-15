import { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Prayer } from "../../packages/shared/src/types";
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
  const [refreshing, setRefreshing] = useState(false);
  const { prayerTimes, nextPrayer, fetchPrayerTimes, updateNextPrayer, isLoading: prayerLoading } = usePrayerStore();
  const { primaryMosque, iqamaSchedule, fetchIqamaSchedule } = useMosqueStore();

  const loadData = useCallback(async () => {
    try {
      const location = await getCurrentLocation();
      await fetchPrayerTimes(location.latitude, location.longitude);
      if (primaryMosque) {
        await fetchIqamaSchedule(primaryMosque.id);
      }
      updateNextPrayer();
    } catch {
      // Location or API error - will show empty state
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1B5E20" />
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
});
