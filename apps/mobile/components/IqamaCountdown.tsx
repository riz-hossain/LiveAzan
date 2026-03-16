import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { formatTimeAMPM } from "../utils/formatTime";

interface IqamaCountdownProps {
  prayerName: string;
  iqamaTime: string; // "HH:mm"
  mosqueName: string;
}

function getTimeUntilMs(timeStr: string): number {
  const now = new Date();
  const [hours, minutes] = timeStr.split(":").map(Number);
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  // If the time has passed today, assume it's tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Now";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function IqamaCountdown({
  prayerName,
  iqamaTime,
  mosqueName,
}: IqamaCountdownProps) {
  const [remainingMs, setRemainingMs] = useState(() =>
    getTimeUntilMs(iqamaTime)
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setRemainingMs(getTimeUntilMs(iqamaTime));

    intervalRef.current = setInterval(() => {
      setRemainingMs(getTimeUntilMs(iqamaTime));
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [iqamaTime]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        Next iqama: {prayerName} at {mosqueName}
      </Text>
      <Text style={styles.countdown}>{formatCountdown(remainingMs)}</Text>
      <Text style={styles.iqamaTime}>Iqama at {formatTimeAMPM(iqamaTime)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1B5E20",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: 8,
  },
  countdown: {
    fontSize: 48,
    fontWeight: "700",
    color: "#fff",
    fontVariant: ["tabular-nums"],
    letterSpacing: 2,
  },
  iqamaTime: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    marginTop: 6,
  },
});
