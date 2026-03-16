import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { formatTimeAMPM } from "../utils/formatTime";

interface PrayerTimeCardProps {
  prayerName: string;
  adhanTime?: string;
  iqamaTime?: string;
  isNext: boolean;
  onPress?: () => void;
}

export function PrayerTimeCard({
  prayerName,
  adhanTime,
  iqamaTime,
  isNext,
  onPress,
}: PrayerTimeCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, isNext && styles.cardHighlighted]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={styles.leftSection}>
        <Text style={[styles.prayerName, isNext && styles.textHighlighted]}>
          {prayerName}
        </Text>
        {isNext && <Text style={styles.nextLabel}>Next</Text>}
      </View>

      <View style={styles.timesSection}>
        <View style={styles.timeColumn}>
          <Text style={styles.timeLabel}>Adhan</Text>
          <Text style={[styles.timeValue, isNext && styles.textHighlighted]}>
            {formatTimeAMPM(adhanTime)}
          </Text>
        </View>

        {iqamaTime !== undefined && (
          <View style={styles.timeColumn}>
            <Text style={styles.timeLabel}>Iqama</Text>
            <Text style={[styles.iqamaValue, isNext && styles.textHighlighted]}>
              {formatTimeAMPM(iqamaTime)}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHighlighted: {
    backgroundColor: "#1B5E20",
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  prayerName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
  },
  textHighlighted: {
    color: "#fff",
  },
  nextLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
    backgroundColor: "#2E7D32",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timesSection: {
    flexDirection: "row",
    gap: 20,
  },
  timeColumn: {
    alignItems: "center",
  },
  timeLabel: {
    fontSize: 11,
    color: "#999",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timeValue: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  iqamaValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B5E20",
  },
});
