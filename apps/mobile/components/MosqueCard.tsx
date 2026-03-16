import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Mosque } from "@live-azan/shared";

interface MosqueCardProps {
  mosque: Mosque;
  onPress: () => void;
}

export function MosqueCard({ mosque, onPress }: MosqueCardProps) {
  const distanceText =
    mosque.distanceKm !== undefined
      ? mosque.distanceKm < 1
        ? `${Math.round(mosque.distanceKm * 1000)}m`
        : `${mosque.distanceKm.toFixed(1)}km`
      : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={1}>
            {mosque.name}
          </Text>
          <View style={styles.badges}>
            {mosque.verified && (
              <Ionicons name="checkmark-circle" size={16} color="#1B5E20" />
            )}
            {mosque.hasLiveStream && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.address} numberOfLines={1}>
          {mosque.address}
        </Text>

        {distanceText && (
          <View style={styles.distanceRow}>
            <Ionicons name="location-outline" size={14} color="#999" />
            <Text style={styles.distance}>{distanceText} away</Text>
          </View>
        )}
      </View>

      <Ionicons name="chevron-forward" size={20} color="#ccc" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: "#222",
    flex: 1,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFEBEE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#D32F2F",
  },
  liveText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#D32F2F",
  },
  address: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  distanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  distance: {
    fontSize: 13,
    color: "#999",
  },
});
