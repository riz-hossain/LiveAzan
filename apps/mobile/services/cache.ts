/**
 * AsyncStorage cache wrapper with TTL support.
 * Used to persist mosque + iqama data locally for offline access.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

interface CacheEntry<T> {
  data: T;
  cachedAt: number; // timestamp ms
}

export async function getCached<T>(
  key: string,
  maxAgeMs: number
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > maxAgeMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCached<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, cachedAt: Date.now() };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Storage full or unavailable — fail silently, app works without cache
  }
}

export async function getCachedTimestamp(key: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<unknown> = JSON.parse(raw);
    return entry.cachedAt;
  } catch {
    return null;
  }
}

export async function clearCached(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ─── Cache key builders ───────────────────────────────────────────────────────

export const nearbyMosquesKey = (lat: number, lon: number): string =>
  `mosques_nearby_${lat.toFixed(2)}_${lon.toFixed(2)}`;

export const iqamaKey = (mosqueId: string): string => `iqama_${mosqueId}`;

/** When the mosque's own page was last looked at, whether or not it gave any times. */
export const iqamaAttemptKey = (mosqueId: string): string => `iqama_attempt_${mosqueId}`;

export const mosqueDetailKey = (mosqueId: string): string =>
  `mosque_detail_${mosqueId}`;

/** Persisted primary mosque — no TTL, lives until user changes it */
export const PRIMARY_MOSQUE_KEY = "primary_mosque";

// ─── TTLs ────────────────────────────────────────────────────────────────────

/** Nearby mosque list — refresh weekly */
export const NEARBY_MOSQUE_TTL = 7 * 24 * 60 * 60 * 1000;

/**
 * How long a reading is kept to show while offline or while the next one is read. It is
 * shown with the day it is for ("These are the times for Sep 14"), and looked at again
 * whenever it is not today's, so this only decides how old is too old to show at all.
 */
export const IQAMA_TTL = 14 * 24 * 60 * 60 * 1000;

/**
 * After looking for a mosque's times, don't do it again on its own for this long, found
 * or not: a mosque that publishes nothing readable is not worth a minute of a person's
 * data every time they open its page. The refresh button ignores it.
 */
export const IQAMA_RETRY_AFTER = 6 * 60 * 60 * 1000;

/** Mosque detail card (name, address, website) — refresh weekly */
export const MOSQUE_DETAIL_TTL = 7 * 24 * 60 * 60 * 1000;
