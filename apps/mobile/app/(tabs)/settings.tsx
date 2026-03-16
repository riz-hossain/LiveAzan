import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Audio } from "expo-av";
import { useAuthStore } from "../../stores/authStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useMosqueStore } from "../../stores/mosqueStore";
import { NotificationSettings } from "../../components/NotificationSettings";
import type { Prayer, UserPrayerPreference } from "@live-azan/shared";

const CALC_METHODS: { label: string; value: number }[] = [
  { label: "ISNA (North America)", value: 2 },
  { label: "MWL (Muslim World League)", value: 3 },
  { label: "Egyptian General Authority", value: 5 },
  { label: "Umm Al-Qura (Makkah)", value: 4 },
  { label: "Karachi", value: 1 },
];

const AZAN_SOUNDS: { label: string; value: string }[] = [
  { label: "Default", value: "azan-default" },
  { label: "Makkah", value: "azan-makkah" },
  { label: "Madinah", value: "azan-madinah" },
  { label: "Al-Aqsa", value: "azan-alaqsa" },
  { label: "Silent", value: "silent" },
];

// Only one sound file is bundled currently; all non-silent previews use it
const AZAN_SOUND_FILE = require("../../assets/sounds/azan_default.wav");

export default function SettingsScreen() {
  const { user, isGuest, logout } = useAuthStore();
  const router = useRouter();
  const { prayerPrefs, calcMethod, azanSound, fetchPreferences, updateCalcMethod, updateAzanSound, updateLeadTime } =
    useSettingsStore();
  const { primaryMosque } = useMosqueStore();

  const [showCalcPicker, setShowCalcPicker] = useState(false);
  const [showAzanPicker, setShowAzanPicker] = useState(false);
  const [playingSound, setPlayingSound] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    if (user) {
      fetchPreferences();
    }
  }, [user]);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, []);

  const stopSound = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setPlayingSound(null);
  };

  const playAzan = async (soundValue: string) => {
    // If this sound is already playing, stop it
    if (playingSound === soundValue) {
      await stopSound();
      return;
    }

    // Stop any currently playing sound
    await stopSound();

    // Silent option — nothing to play
    if (soundValue === "silent") return;

    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(AZAN_SOUND_FILE, {
        shouldPlay: true,
      });
      soundRef.current = sound;
      setPlayingSound(soundValue);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          soundRef.current = null;
          setPlayingSound(null);
        }
      });
    } catch {
      setPlayingSound(null);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  };

  const handlePrefUpdate = useCallback(
    async (prayer: Prayer, leadMinutes: number) => {
      try {
        await updateLeadTime(prayer, leadMinutes);
      } catch {
        Alert.alert("Error", "Failed to update notification preference.");
      }
    },
    [updateLeadTime]
  );

  const currentCalcLabel =
    CALC_METHODS.find((m) => m.value === calcMethod)?.label || "Unknown";
  const currentAzanLabel =
    AZAN_SOUNDS.find((s) => s.value === azanSound)?.label || "Default";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={28} color="#fff" />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {user?.displayName || (isGuest ? "Guest" : "User")}
              </Text>
              {user?.email ? (
                <Text style={styles.profileEmail}>{user.email}</Text>
              ) : isGuest ? (
                <Text style={styles.profileEmail}>No account</Text>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      {/* Primary Mosque Section */}
      {primaryMosque && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Primary Mosque</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="business" size={20} color="#1B5E20" />
              <Text style={styles.rowText}>{primaryMosque.name}</Text>
            </View>
            <Text style={styles.subText}>{primaryMosque.address}</Text>
          </View>
        </View>
      )}

      {/* Notification Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notification Preferences</Text>
        <NotificationSettings
          prayerPrefs={prayerPrefs}
          onUpdate={handlePrefUpdate}
        />
      </View>

      {/* Calculation Method */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Calculation Method</Text>
        <TouchableOpacity
          style={styles.card}
          onPress={() => setShowCalcPicker(!showCalcPicker)}
        >
          <View style={styles.row}>
            <Ionicons name="calculator-outline" size={20} color="#1B5E20" />
            <Text style={styles.rowText}>{currentCalcLabel}</Text>
            <Ionicons
              name={showCalcPicker ? "chevron-up" : "chevron-down"}
              size={20}
              color="#999"
            />
          </View>
        </TouchableOpacity>
        {showCalcPicker && (
          <View style={styles.pickerList}>
            {CALC_METHODS.map((method) => (
              <TouchableOpacity
                key={method.value}
                style={[
                  styles.pickerItem,
                  calcMethod === method.value && styles.pickerItemActive,
                ]}
                onPress={() => {
                  updateCalcMethod(method.value);
                  setShowCalcPicker(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    calcMethod === method.value && styles.pickerItemTextActive,
                  ]}
                >
                  {method.label}
                </Text>
                {calcMethod === method.value && (
                  <Ionicons name="checkmark" size={20} color="#1B5E20" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Azan Sound */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Azan Sound</Text>
        <TouchableOpacity
          style={styles.card}
          onPress={() => setShowAzanPicker(!showAzanPicker)}
        >
          <View style={styles.row}>
            <Ionicons name="musical-notes-outline" size={20} color="#1B5E20" />
            <Text style={styles.rowText}>{currentAzanLabel}</Text>
            <Ionicons
              name={showAzanPicker ? "chevron-up" : "chevron-down"}
              size={20}
              color="#999"
            />
          </View>
        </TouchableOpacity>
        {showAzanPicker && (
          <View style={styles.pickerList}>
            {AZAN_SOUNDS.map((sound) => (
              <TouchableOpacity
                key={sound.value}
                style={[
                  styles.pickerItem,
                  azanSound === sound.value && styles.pickerItemActive,
                ]}
                onPress={() => {
                  updateAzanSound(sound.value);
                  setShowAzanPicker(false);
                  stopSound();
                }}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    azanSound === sound.value && styles.pickerItemTextActive,
                  ]}
                >
                  {sound.label}
                </Text>
                <View style={styles.pickerItemRight}>
                  {azanSound === sound.value && (
                    <Ionicons name="checkmark" size={20} color="#1B5E20" />
                  )}
                  {sound.value !== "silent" && (
                    <TouchableOpacity
                      style={styles.playButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        playAzan(sound.value);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={playingSound === sound.value ? "stop" : "play"}
                        size={18}
                        color="#1B5E20"
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Sign Out / Sign In */}
      {isGuest && !user ? (
        <TouchableOpacity
          style={styles.signInButton}
          onPress={() => {
            logout();
            router.replace("/(auth)/login");
          }}
        >
          <Ionicons name="log-in-outline" size={20} color="#1B5E20" />
          <Text style={styles.signInText}>Sign In</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.signOutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#D32F2F" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      )}
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
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1B5E20",
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#222",
  },
  profileEmail: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowText: {
    flex: 1,
    fontSize: 16,
    color: "#333",
  },
  subText: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
    marginLeft: 30,
  },
  pickerList: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  pickerItemActive: {
    backgroundColor: "#E8F5E9",
  },
  pickerItemText: {
    flex: 1,
    fontSize: 15,
    color: "#333",
  },
  pickerItemTextActive: {
    color: "#1B5E20",
    fontWeight: "600",
  },
  pickerItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  playButton: {
    padding: 4,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D32F2F",
    gap: 8,
    marginTop: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#D32F2F",
  },
  signInButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#1B5E20",
    gap: 8,
    marginTop: 8,
  },
  signInText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
