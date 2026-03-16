import React, { useState } from "react";
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type {
  Prayer,
  UserPrayerPreference,
  NotificationType,
} from "@live-azan/shared";

interface NotificationSettingsProps {
  prayerPrefs: UserPrayerPreference[];
  onUpdate: (prayer: Prayer, leadMinutes: number) => void;
}

const PRAYER_ORDER: Prayer[] = [
  "FAJR" as Prayer,
  "DHUHR" as Prayer,
  "ASR" as Prayer,
  "MAGHRIB" as Prayer,
  "ISHA" as Prayer,
];

const PRAYER_LABELS: Record<string, string> = {
  FAJR: "Fajr",
  DHUHR: "Dhuhr",
  ASR: "Asr",
  MAGHRIB: "Maghrib",
  ISHA: "Isha",
};

const NOTIFICATION_TYPES: { label: string; value: NotificationType }[] = [
  { label: "Azan", value: "AZAN" as NotificationType },
  { label: "Silent Alert", value: "SILENT_ALERT" as NotificationType },
  { label: "Departure Reminder", value: "DEPARTURE_REMINDER" as NotificationType },
];

const LEAD_TIME_OPTIONS = [5, 10, 15, 20, 30, 45, 60];

export function NotificationSettings({
  prayerPrefs,
  onUpdate,
}: NotificationSettingsProps) {
  const [expandedPrayer, setExpandedPrayer] = useState<Prayer | null>(null);

  const getPref = (prayer: Prayer): UserPrayerPreference | undefined => {
    return prayerPrefs.find((p) => p.prayer === prayer);
  };

  const toggleExpanded = (prayer: Prayer) => {
    setExpandedPrayer(expandedPrayer === prayer ? null : prayer);
  };

  return (
    <View style={styles.container}>
      {PRAYER_ORDER.map((prayer) => {
        const pref = getPref(prayer);
        const isExpanded = expandedPrayer === prayer;
        const isEnabled = pref?.enabled ?? true;
        const leadMinutes = pref?.leadMinutes ?? 15;
        const notificationType = pref?.notificationType ?? ("AZAN" as NotificationType);

        return (
          <View key={prayer} style={styles.prayerSection}>
            {/* Prayer Header */}
            <TouchableOpacity
              style={styles.prayerHeader}
              onPress={() => toggleExpanded(prayer)}
            >
              <View style={styles.prayerHeaderLeft}>
                <Text style={styles.prayerName}>
                  {PRAYER_LABELS[prayer] || prayer}
                </Text>
                <Text style={styles.prayerSummary}>
                  {isEnabled ? `${leadMinutes} min before` : "Disabled"}
                </Text>
              </View>
              <View style={styles.prayerHeaderRight}>
                <Switch
                  value={isEnabled}
                  onValueChange={() => {
                    // Toggle would need an onToggle callback; for now uses onUpdate
                  }}
                  trackColor={{ false: "#ddd", true: "#81C784" }}
                  thumbColor={isEnabled ? "#1B5E20" : "#f4f3f4"}
                />
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={20}
                  color="#999"
                />
              </View>
            </TouchableOpacity>

            {/* Expanded Settings */}
            {isExpanded && (
              <View style={styles.expandedContent}>
                {/* Lead Time Selector */}
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Lead Time</Text>
                  <View style={styles.leadTimeOptions}>
                    {LEAD_TIME_OPTIONS.map((minutes) => (
                      <TouchableOpacity
                        key={minutes}
                        style={[
                          styles.leadTimeOption,
                          leadMinutes === minutes && styles.leadTimeOptionActive,
                        ]}
                        onPress={() => onUpdate(prayer, minutes)}
                      >
                        <Text
                          style={[
                            styles.leadTimeText,
                            leadMinutes === minutes && styles.leadTimeTextActive,
                          ]}
                        >
                          {minutes}m
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Notification Type Picker */}
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Notification Type</Text>
                  <View style={styles.typeOptions}>
                    {NOTIFICATION_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type.value}
                        style={[
                          styles.typeOption,
                          notificationType === type.value &&
                            styles.typeOptionActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeOptionText,
                            notificationType === type.value &&
                              styles.typeOptionTextActive,
                          ]}
                        >
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Maghrib Note */}
                {prayer === ("MAGHRIB" as Prayer) && (
                  <View style={styles.noteContainer}>
                    <Ionicons
                      name="information-circle-outline"
                      size={16}
                      color="#E65100"
                    />
                    <Text style={styles.noteText}>
                      Azan plays at sunset only. Pre-sunset notification is a
                      departure reminder.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  prayerSection: {
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  prayerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  prayerHeaderLeft: {
    flex: 1,
  },
  prayerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  prayerSummary: {
    fontSize: 13,
    color: "#999",
    marginTop: 2,
  },
  prayerHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },
  settingRow: {
    gap: 8,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  leadTimeOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  leadTimeOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  leadTimeOptionActive: {
    backgroundColor: "#E8F5E9",
    borderColor: "#1B5E20",
  },
  leadTimeText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  leadTimeTextActive: {
    color: "#1B5E20",
    fontWeight: "600",
  },
  typeOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  typeOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  typeOptionActive: {
    backgroundColor: "#E8F5E9",
    borderColor: "#1B5E20",
  },
  typeOptionText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  typeOptionTextActive: {
    color: "#1B5E20",
    fontWeight: "600",
  },
  noteContainer: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#FFF3E0",
    padding: 12,
    borderRadius: 8,
    alignItems: "flex-start",
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    color: "#E65100",
    lineHeight: 18,
  },
});
