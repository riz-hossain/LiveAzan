import type { PrayerTimes, NextPrayer, Prayer } from "@live-azan/shared";
import { fetchPrayerTimesApi } from "./api";

// ─── In-Memory Cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  data: PrayerTimes;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(lat: number, lon: number, date: string): string {
  // Round coordinates to 2 decimal places for cache key
  const roundedLat = Math.round(lat * 100) / 100;
  const roundedLon = Math.round(lon * 100) / 100;
  return `${roundedLat}:${roundedLon}:${date}`;
}

function getFromCache(key: string): PrayerTimes | null {
  const entry = cache.get(key);
  if (!entry) return null;

  const isExpired = Date.now() - entry.timestamp > CACHE_DURATION_MS;
  if (isExpired) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

function setCache(key: string, data: PrayerTimes): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getPrayerTimes(
  lat: number,
  lon: number,
  date?: string,
  method?: number
): Promise<PrayerTimes> {
  const today = date || new Date().toISOString().split("T")[0];
  const cacheKey = getCacheKey(lat, lon, today);

  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  // Try API
  try {
    const times = await fetchPrayerTimesApi(lat, lon, today, method);
    setCache(cacheKey, times);
    return times;
  } catch {
    // If API fails, return a placeholder to indicate unavailable
    throw new Error(
      "Prayer times unavailable. Please check your connection and try again."
    );
  }
}

export function getNextPrayer(prayerTimes: PrayerTimes): NextPrayer | null {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const prayers: { prayer: Prayer; time: string }[] = [
    { prayer: "FAJR" as Prayer, time: prayerTimes.fajr },
    { prayer: "DHUHR" as Prayer, time: prayerTimes.dhuhr },
    { prayer: "ASR" as Prayer, time: prayerTimes.asr },
    { prayer: "MAGHRIB" as Prayer, time: prayerTimes.maghrib },
    { prayer: "ISHA" as Prayer, time: prayerTimes.isha },
  ];

  for (const p of prayers) {
    const [hours, minutes] = p.time.split(":").map(Number);
    const prayerMinutes = hours * 60 + minutes;

    if (prayerMinutes > currentMinutes) {
      const timeUntilMs = (prayerMinutes - currentMinutes) * 60 * 1000;
      return {
        prayer: p.prayer,
        time: p.time,
        timeUntilMs,
      };
    }
  }

  // All prayers passed today, next is Fajr tomorrow
  if (prayers.length > 0) {
    const fajr = prayers[0];
    const [hours, minutes] = fajr.time.split(":").map(Number);
    const fajrMinutes = hours * 60 + minutes;
    const minutesUntilMidnight = 24 * 60 - currentMinutes;
    const timeUntilMs = (minutesUntilMidnight + fajrMinutes) * 60 * 1000;

    return {
      prayer: fajr.prayer,
      time: fajr.time,
      timeUntilMs,
    };
  }

  return null;
}
