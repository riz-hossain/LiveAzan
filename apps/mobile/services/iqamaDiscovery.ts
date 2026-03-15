/**
 * Iqama discovery — runs entirely on the device.
 *
 * When a user taps "Find Iqama Times Near Me", this service:
 * 1. Queries MAWAQIT directly (mosques that self-publish iqama times)
 * 2. Merges with our backend DB (curated seed data)
 * 3. For mosques with a website but no MAWAQIT entry, scrapes the site
 * 4. Caches everything to AsyncStorage for offline use
 *
 * No backend proxy is needed — native apps can call any API directly.
 */

import type { Mosque, IqamaSchedule } from "../packages/shared/src/types";
import { Prayer } from "../packages/shared/src/types";
import { fetchMosquesNearby } from "./api";
import {
  searchNearby,
  getByUuid,
  findBestMatch,
  extractIqamaTimes,
  normalizeTime,
  type IqamaTimes,
} from "./mawaqitService";
import {
  getCached,
  setCached,
  nearbyMosquesKey,
  iqamaKey,
  NEARBY_MOSQUE_TTL,
  IQAMA_TTL,
} from "./cache";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DiscoveredMosque extends Mosque {
  discoveredIqama?: IqamaTimes;   // iqama times found during this session
  iqamaSource?: "mawaqit" | "website" | "manual";
  iqamaLastFetched?: string;      // ISO string
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Discover nearby mosques and their iqama times.
 * Returns merged results from MAWAQIT + our backend.
 * Results are cached to AsyncStorage.
 */
export async function discoverNearbyIqama(
  lat: number,
  lon: number
): Promise<DiscoveredMosque[]> {
  // Fetch from MAWAQIT and our backend in parallel
  const [mawaqitMosques, backendResponse] = await Promise.allSettled([
    searchNearby(lat, lon, 5000),
    fetchMosquesNearby(lat, lon, 25),
  ]);

  const mawaqit =
    mawaqitMosques.status === "fulfilled" ? mawaqitMosques.value : [];
  const backendMosques =
    backendResponse.status === "fulfilled"
      ? backendResponse.value.mosques
      : [];

  // Start with MAWAQIT results, enriched with iqama times
  const discovered: DiscoveredMosque[] = mawaqit.map((m) => ({
    id: m.uuid,
    name: m.name,
    type: "MOSQUE" as any,
    address: "",
    city: "",
    province: "",
    country: "Canada",
    latitude: m.latitude,
    longitude: m.longitude,
    hasLiveStream: false,
    verified: false,
    mawaqitId: m.uuid,
    iqamaSource: "mawaqit" as const,
    iqamaLastFetched: new Date().toISOString(),
    discoveredIqama: extractIqamaTimes(m),
  }));

  // Merge backend mosques: update existing entries with richer data,
  // append ones that aren't in MAWAQIT results.
  for (const bm of backendMosques) {
    const matchIdx = discovered.findIndex(
      (d) =>
        haversineKm(d.latitude, d.longitude, bm.latitude, bm.longitude) < 0.2
    );

    if (matchIdx >= 0) {
      // Merge: keep MAWAQIT iqama times but use backend's richer metadata
      discovered[matchIdx] = {
        ...bm,
        id: bm.id, // use our DB id for navigation
        mawaqitId: discovered[matchIdx].mawaqitId,
        discoveredIqama: discovered[matchIdx].discoveredIqama,
        iqamaSource: "mawaqit",
        iqamaLastFetched: discovered[matchIdx].iqamaLastFetched,
      };
    } else {
      // Backend-only mosque: try to match on MAWAQIT
      const mawaqitMatch = findBestMatch(
        mawaqit,
        bm.name,
        bm.latitude,
        bm.longitude
      );

      let discoveredIqama: IqamaTimes | undefined;
      let source: "mawaqit" | "website" | "manual" | undefined;

      if (mawaqitMatch) {
        discoveredIqama = extractIqamaTimes(mawaqitMatch);
        source = "mawaqit";
      } else if (bm.website) {
        // Fallback: scrape the mosque website
        discoveredIqama = await scrapeWebsiteIqama(bm.website);
        if (Object.keys(discoveredIqama).length > 0) {
          source = "website";
        }
      }

      discovered.push({
        ...bm,
        discoveredIqama,
        iqamaSource: source,
        iqamaLastFetched:
          source ? new Date().toISOString() : bm.iqamaLastFetched,
      });
    }
  }

  // Sort by distance to user
  discovered.sort((a, b) => {
    const da = haversineKm(lat, lon, a.latitude, a.longitude);
    const db = haversineKm(lat, lon, b.latitude, b.longitude);
    return da - db;
  });

  // Cache the merged results
  const cacheKey = nearbyMosquesKey(lat, lon);
  await setCached(cacheKey, discovered);

  // Cache individual iqama schedules
  for (const mosque of discovered) {
    if (mosque.discoveredIqama && Object.keys(mosque.discoveredIqama).length > 0) {
      const schedules = iqamaTimesToSchedules(mosque.id, mosque.discoveredIqama);
      await setCached(iqamaKey(mosque.id), {
        schedules,
        source: mosque.iqamaSource,
        lastFetched: mosque.iqamaLastFetched,
      });
    }
  }

  return discovered;
}

/**
 * Fetch full iqama detail for a single mosque.
 * Tries: cached data → MAWAQIT direct → website scrape.
 */
export async function refreshSingleMosqueIqama(mosque: Mosque): Promise<{
  iqamaTimes: IqamaTimes;
  source: "mawaqit" | "website" | "manual" | null;
}> {
  // Try MAWAQIT first
  const mawaqitId = mosque.mawaqitId;
  if (mawaqitId) {
    const full = await getByUuid(mawaqitId);
    if (full) {
      const iqamaTimes = extractIqamaTimes(full);
      if (Object.keys(iqamaTimes).length > 0) {
        await cacheIqama(mosque.id, iqamaTimes, "mawaqit");
        return { iqamaTimes, source: "mawaqit" };
      }
    }
  } else {
    // Search MAWAQIT by location
    const candidates = await searchNearby(mosque.latitude, mosque.longitude, 300);
    const match = findBestMatch(
      candidates,
      mosque.name,
      mosque.latitude,
      mosque.longitude
    );
    if (match) {
      const full = await getByUuid(match.uuid);
      const iqamaTimes = full ? extractIqamaTimes(full) : extractIqamaTimes(match);
      if (Object.keys(iqamaTimes).length > 0) {
        await cacheIqama(mosque.id, iqamaTimes, "mawaqit");
        return { iqamaTimes, source: "mawaqit" };
      }
    }
  }

  // Fallback: mosque website
  if (mosque.website) {
    const iqamaTimes = await scrapeWebsiteIqama(mosque.website);
    if (Object.keys(iqamaTimes).length > 0) {
      await cacheIqama(mosque.id, iqamaTimes, "website");
      return { iqamaTimes, source: "website" };
    }
  }

  return { iqamaTimes: {}, source: null };
}

// ─── Website scraping (fallback) ─────────────────────────────────────────────

/**
 * Fetch a mosque website and extract iqama times using regex.
 * Works for ~60% of mosque websites that post schedules as text.
 * No HTML parser needed — raw text matching is sufficient.
 */
export async function scrapeWebsiteIqama(url: string): Promise<IqamaTimes> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "LiveAzan/1.0 (mosque schedule lookup)" },
    });
    if (!res.ok) return {};

    const html = await res.text();
    // Strip tags to get readable text
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    return parseIqamaFromText(text);
  } catch {
    return {};
  }
}

/**
 * Parse iqama times from plain text.
 * Exported for testing and reuse in the research script.
 */
export function parseIqamaFromText(text: string): IqamaTimes {
  const result: IqamaTimes = {};
  const lower = text.toLowerCase();

  const prayerPatterns: Array<[keyof IqamaTimes, RegExp]> = [
    ["fajr", /fajr/],
    ["dhuhr", /dhuhr|zuhr|zohr/],
    ["asr", /asr|'asr/],
    ["maghrib", /maghrib|magrib/],
    ["isha", /isha|'isha|esha/],
  ];

  // Time pattern: "6:30", "06:30", "6:30 AM", "6:30PM"
  const timeRe = /(\d{1,2}:\d{2})\s*(am|pm)?/gi;

  for (const [prayer, nameRe] of prayerPatterns) {
    const idx = lower.search(nameRe);
    if (idx === -1) continue;

    // Look for a time within 100 characters after the prayer name
    const slice = text.slice(idx, idx + 100);
    timeRe.lastIndex = 0;
    const match = timeRe.exec(slice);
    if (match) {
      const raw = match[1] + (match[2] ? ` ${match[2]}` : "");
      result[prayer] = normalizeTime(raw);
    }
  }

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function cacheIqama(
  mosqueId: string,
  iqamaTimes: IqamaTimes,
  source: "mawaqit" | "website"
): Promise<void> {
  const schedules = iqamaTimesToSchedules(mosqueId, iqamaTimes);
  await setCached(iqamaKey(mosqueId), {
    schedules,
    source,
    lastFetched: new Date().toISOString(),
  });
}

function iqamaTimesToSchedules(
  mosqueId: string,
  times: IqamaTimes
): IqamaSchedule[] {
  const now = new Date().toISOString();
  const prayerMap: Array<[keyof IqamaTimes, Prayer]> = [
    ["fajr", Prayer.FAJR],
    ["dhuhr", Prayer.DHUHR],
    ["asr", Prayer.ASR],
    ["maghrib", Prayer.MAGHRIB],
    ["isha", Prayer.ISHA],
  ];

  return prayerMap
    .filter(([key]) => times[key])
    .map(([key, prayer]) => ({
      id: `${mosqueId}_${prayer}_discovered`,
      mosqueId,
      prayer,
      iqamaTime: times[key]!,
      effectiveFrom: now,
    }));
}
