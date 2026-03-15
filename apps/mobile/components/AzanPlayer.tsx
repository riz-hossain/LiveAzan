import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { playAzan, stopAzan, isPlaying, AZAN_SOUNDS } from "../services/azanAudio";

interface AzanPlayerProps {
  mosqueId: string;
  prayer: string;
  hasLiveStream?: boolean;
  streamUrl?: string;
  onClose?: () => void;
}

export function AzanPlayer({
  mosqueId,
  prayer,
  hasLiveStream,
  streamUrl,
  onClose,
}: AzanPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [selectedSound, setSelectedSound] = useState("azan-default");

  const handlePlayPause = useCallback(async () => {
    try {
      if (playing) {
        await stopAzan();
        setPlaying(false);
      } else {
        await playAzan(selectedSound);
        setPlaying(true);
      }
    } catch {
      setPlaying(false);
    }
  }, [playing, selectedSound]);

  const handleStop = useCallback(async () => {
    await stopAzan();
    setPlaying(false);
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{prayer} Azan</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* Live Stream Indicator */}
      {hasLiveStream && (
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live Stream Available</Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.playButton}
          onPress={handlePlayPause}
        >
          <Ionicons
            name={playing ? "pause" : "play"}
            size={32}
            color="#fff"
          />
        </TouchableOpacity>

        {playing && (
          <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
            <Ionicons name="stop" size={24} color="#D32F2F" />
          </TouchableOpacity>
        )}
      </View>

      {/* Sound Selector (only for recorded azan) */}
      {!hasLiveStream && (
        <View style={styles.soundSelector}>
          <Text style={styles.soundLabel}>Azan Sound</Text>
          <View style={styles.soundOptions}>
            {AZAN_SOUNDS.map((sound) => (
              <TouchableOpacity
                key={sound.id}
                style={[
                  styles.soundOption,
                  selectedSound === sound.id && styles.soundOptionActive,
                ]}
                onPress={() => setSelectedSound(sound.id)}
              >
                <Text
                  style={[
                    styles.soundOptionText,
                    selectedSound === sound.id &&
                      styles.soundOptionTextActive,
                  ]}
                >
                  {sound.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    margin: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
  },
  closeButton: {
    padding: 4,
  },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
    backgroundColor: "#FFEBEE",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D32F2F",
  },
  liveText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#D32F2F",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 16,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#1B5E20",
    alignItems: "center",
    justifyContent: "center",
  },
  stopButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFEBEE",
    alignItems: "center",
    justifyContent: "center",
  },
  soundSelector: {
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingTop: 16,
  },
  soundLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  soundOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  soundOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  soundOptionActive: {
    backgroundColor: "#E8F5E9",
    borderColor: "#1B5E20",
  },
  soundOptionText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  soundOptionTextActive: {
    color: "#1B5E20",
    fontWeight: "600",
  },
});
