import { Prayer, PrayerTimes, NextPrayer } from "./types";
import { PRAYER_ORDER } from "./constants";

/**
 * Parse "HH:mm" time string to today's Date object.
 */
export function parseTime(timeStr: string, date?: Date): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = date ? new Date(date) : new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * Format a Date to "HH:mm" string.
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Format a Date to "h:mm AM/PM" string for display.
 */
export function formatTime12h(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Get the next upcoming prayer from a PrayerTimes object.
 */
export function getNextPrayer(prayerTimes: PrayerTimes): NextPrayer | null {
  const now = new Date();

  const prayerMap: Record<string, Prayer> = {
    fajr: Prayer.FAJR,
    dhuhr: Prayer.DHUHR,
    asr: Prayer.ASR,
    maghrib: Prayer.MAGHRIB,
    isha: Prayer.ISHA,
  };

  for (const key of Object.keys(prayerMap)) {
    const time = prayerTimes[key as keyof PrayerTimes] as string;
    const prayerDate = parseTime(time);

    if (prayerDate > now) {
      return {
        prayer: prayerMap[key],
        time,
        timeUntilMs: prayerDate.getTime() - now.getTime(),
      };
    }
  }

  // All prayers passed — next is tomorrow's Fajr
  return null;
}

/**
 * Calculate distance between two coordinates using Haversine formula.
 * Returns distance in kilometers.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Format milliseconds to human-readable countdown.
 * e.g. 3600000 → "1h 0m", 900000 → "15m"
 */
export function formatCountdown(ms: number): string {
  if (ms < 0) return "Now";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Check if a prayer is Maghrib (special handling needed).
 */
export function isMaghrib(prayer: Prayer): boolean {
  return prayer === Prayer.MAGHRIB;
}

/**
 * Get today's date in "DD-MM-YYYY" format for Aladhan API.
 */
export function getTodayForAladhan(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

/**
 * Get today's date in "YYYY-MM-DD" ISO format.
 */
export function getTodayISO(): string {
  return new Date().toISOString().split("T")[0];
}
