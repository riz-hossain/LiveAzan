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

export const mosqueDetailKey = (mosqueId: string): string =>
  `mosque_detail_${mosqueId}`;

/** Persisted primary mosque — no TTL, lives until user changes it */
export const PRIMARY_MOSQUE_KEY = "primary_mosque";

// ─── TTLs ────────────────────────────────────────────────────────────────────

/** Nearby mosque list — refresh weekly */
export const NEARBY_MOSQUE_TTL = 7 * 24 * 60 * 60 * 1000;

/** Iqama times — refresh every 3 days (schedules change seasonally) */
export const IQAMA_TTL = 3 * 24 * 60 * 60 * 1000;

/** Mosque detail card (name, address, website) — refresh weekly */
export const MOSQUE_DETAIL_TTL = 7 * 24 * 60 * 60 * 1000;
