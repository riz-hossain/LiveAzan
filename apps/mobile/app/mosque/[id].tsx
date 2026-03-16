import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMosqueStore } from "../../stores/mosqueStore";
import type { Prayer, IqamaSchedule } from "@live-azan/shared";

const PRAYER_ORDER: Prayer[] = ["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA"] as Prayer[];

const PRAYER_LABELS: Record<string, string> = {
  FAJR: "Fajr",
  DHUHR: "Dhuhr",
  ASR: "Asr",
  MAGHRIB: "Maghrib",
  ISHA: "Isha",
  JUMMAH: "Jummah",
};

const SOURCE_LABEL: Record<string, string> = {
  mawaqit: "MAWAQIT",
  website: "Website",
  manual: "LiveAzan",
};

const SOURCE_COLOR: Record<string, string> = {
  mawaqit: "#1565C0",
  website: "#6A1B9A",
  manual: "#1B5E20",
};

function staleness(lastFetched: string | null): string | null {
  if (!lastFetched) return null;
  const ms = Date.now() - new Date(lastFetched).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  return `Updated ${days} days ago`;
}

export default function MosqueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    activeMosque,
    iqamaSchedule,
    iqamaSource,
    iqamaLastFetched,
    primaryMosque,
    fetchIqamaSchedule,
    setPrimaryMosque,
    refreshIqama,
    isLoading,
  } = useMosqueStore();

  const [isFollowing, setIsFollowing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (id) {
      fetchIqamaSchedule(id);
    }
  }, [id]);

  const isPrimary = primaryMosque?.id === id;
  const mosque = activeMosque;

  const getIqamaTime = (prayer: Prayer): string | undefined => {
    const entry = iqamaSchedule.find((s: IqamaSchedule) => s.prayer === prayer);
    return entry?.iqamaTime;
  };

  const hasAnyIqama = PRAYER_ORDER.some((p) => getIqamaTime(p));
  const stalenessLabel = staleness(iqamaLastFetched);

  const handleSetPrimary = async () => {
    if (!id) return;
    try {
      await setPrimaryMosque(id);
      Alert.alert("Success", "This mosque is now your primary mosque.");
    } catch {
      Alert.alert("Error", "Failed to set primary mosque.");
    }
  };

  const handleFollow = () => {
    setIsFollowing(!isFollowing);
  };

  const handleCall = () => {
    if (mosque?.phone) {
      Linking.openURL(`tel:${mosque.phone}`);
    }
  };

  const handleWebsite = () => {
    if (mosque?.website) {
      Linking.openURL(mosque.website);
    }
  };

  const handleRefreshIqama = async () => {
    if (!mosque) return;
    setIsRefreshing(true);
    try {
      await refreshIqama(mosque);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!mosque) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: "Mosque" }} />
        <ActivityIndicator size="large" color="#1B5E20" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: mosque.name,
          headerStyle: { backgroundColor: "#1B5E20" },
          headerTintColor: "#fff",
        }}
      />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.mosqueName}>{mosque.name}</Text>
        <View style={styles.badges}>
          {mosque.verified && (
            <View style={styles.badge}>
              <Ionicons name="checkmark-circle" size={16} color="#1B5E20" />
              <Text style={styles.badgeText}>Verified</Text>
            </View>
          )}
          {mosque.hasLiveStream && (
            <View style={[styles.badge, styles.liveBadge]}>
              <Ionicons name="radio" size={16} color="#D32F2F" />
              <Text style={[styles.badgeText, styles.liveText]}>Live</Text>
            </View>
          )}
        </View>
      </View>

      {/* Info */}
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={20} color="#666" />
          <Text style={styles.infoText}>{mosque.address}</Text>
        </View>
        {mosque.phone && (
          <TouchableOpacity style={styles.infoRow} onPress={handleCall}>
            <Ionicons name="call-outline" size={20} color="#666" />
            <Text style={[styles.infoText, styles.linkText]}>{mosque.phone}</Text>
          </TouchableOpacity>
        )}
        {mosque.website && (
          <TouchableOpacity style={styles.infoRow} onPress={handleWebsite}>
            <Ionicons name="globe-outline" size={20} color="#666" />
            <Text style={[styles.infoText, styles.linkText]} numberOfLines={1}>
              {mosque.website}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Iqama Schedule */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's Iqama Schedule</Text>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefreshIqama}
            disabled={isRefreshing || isLoading}
          >
            {isRefreshing || isLoading ? (
              <ActivityIndicator size="small" color="#1B5E20" />
            ) : (
              <Ionicons name="refresh-outline" size={18} color="#1B5E20" />
            )}
          </TouchableOpacity>
        </View>

        {/* Data source + staleness */}
        {(iqamaSource || stalenessLabel) && (
          <View style={styles.metaRow}>
            {iqamaSource && (
              <View
                style={[
                  styles.sourceBadge,
                  { backgroundColor: `${SOURCE_COLOR[iqamaSource]}18` },
                ]}
              >
                <Text
                  style={[
                    styles.sourceText,
                    { color: SOURCE_COLOR[iqamaSource] },
                  ]}
                >
                  {SOURCE_LABEL[iqamaSource] ?? iqamaSource}
                </Text>
              </View>
            )}
            {stalenessLabel && (
              <Text style={styles.stalenessText}>{stalenessLabel}</Text>
            )}
          </View>
        )}

        {!hasAnyIqama && (
          <View style={styles.noIqamaHint}>
            <Ionicons name="information-circle-outline" size={16} color="#999" />
            <Text style={styles.noIqamaText}>
              Tap refresh to search for iqama times from MAWAQIT and this mosque's website.
            </Text>
          </View>
        )}

        <View style={styles.scheduleCard}>
          {PRAYER_ORDER.map((prayer) => {
            const iqamaTime = getIqamaTime(prayer);
            return (
              <View key={prayer} style={styles.scheduleRow}>
                <Text style={styles.prayerName}>
                  {PRAYER_LABELS[prayer] || prayer}
                </Text>
                <Text
                  style={[
                    styles.iqamaTime,
                    !iqamaTime && styles.iqamaTimeMissing,
                  ]}
                >
                  {iqamaTime || "--:--"}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, isFollowing && styles.followingButton]}
          onPress={handleFollow}
        >
          <Ionicons
            name={isFollowing ? "heart" : "heart-outline"}
            size={20}
            color={isFollowing ? "#fff" : "#1B5E20"}
          />
          <Text
            style={[
              styles.actionButtonText,
              isFollowing && styles.followingButtonText,
            ]}
          >
            {isFollowing ? "Following" : "Follow this mosque"}
          </Text>
        </TouchableOpacity>

        {!isPrimary && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSetPrimary}
          >
            <Ionicons name="star-outline" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Set as Primary</Text>
          </TouchableOpacity>
        )}

        {isPrimary && (
          <View style={styles.primaryIndicator}>
            <Ionicons name="star" size={20} color="#1B5E20" />
            <Text style={styles.primaryIndicatorText}>Your Primary Mosque</Text>
          </View>
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
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  header: {
    marginBottom: 16,
  },
  mosqueName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#222",
    marginBottom: 8,
  },
  badges: {
    flexDirection: "row",
    gap: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1B5E20",
  },
  liveBadge: {
    backgroundColor: "#FFEBEE",
  },
  liveText: {
    color: "#D32F2F",
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    color: "#333",
  },
  linkText: {
    color: "#1565C0",
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  refreshButton: {
    padding: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sourceText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  stalenessText: {
    fontSize: 12,
    color: "#999",
  },
  noIqamaHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#FFF8E1",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  noIqamaText: {
    flex: 1,
    fontSize: 13,
    color: "#795548",
    lineHeight: 18,
  },
  scheduleCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  scheduleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  prayerName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  iqamaTime: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1B5E20",
  },
  iqamaTimeMissing: {
    color: "#ccc",
    fontWeight: "400",
  },
  actions: {
    gap: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#1B5E20",
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1B5E20",
  },
  followingButton: {
    backgroundColor: "#1B5E20",
    borderColor: "#1B5E20",
  },
  followingButtonText: {
    color: "#fff",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#1B5E20",
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  primaryIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#E8F5E9",
    gap: 8,
  },
  primaryIndicatorText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1B5E20",
  },
});
