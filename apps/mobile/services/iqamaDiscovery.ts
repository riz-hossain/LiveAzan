/**
 * Iqama discovery — runs entirely on the device.
 *
 * Source priority for mosque list:
 *  1. Backend DB (authoritative, pre-enriched) — used when running
 *  2. Bundled local research data (offline, ships with the app)
 *  3. OpenStreetMap Overpass API (public, no auth, last resort)
 *
 * Iqama time enrichment (applied to whichever source is used):
 *  1. Backend iqamaSchedules / local bundle iqamaTimes — used if present
 *  2. MAWAQIT direct API — matched by name + location
 *  3. Mosque website scrape — for mosques with a website but no MAWAQIT record
 *
 * All results are cached to AsyncStorage for offline use.
 * No backend proxy is needed — native apps can call any API directly.
 */

import type { Mosque, IqamaSchedule } from "@live-azan/shared";
import { Prayer } from "@live-azan/shared";
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
import { searchLocalMosques } from "./localMosqueSearch";
import {
  searchOverpassMosques,
  type OverpassMosque,
} from "./overpassService";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DiscoveredMosque extends Mosque {
  discoveredIqama?: IqamaTimes;   // iqama times found during this session
  iqamaSource?: "mawaqit" | "website" | "manual";
  iqamaLastFetched?: string;      // ISO string
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Discover nearby mosques and their iqama times.
 *
 * Priority order:
 *  1. Our backend (pre-enriched, curated) — use iqamaSchedules if present
 *  2. MAWAQIT direct — for backend mosques missing iqama + new discoveries
 *  3. Website scrape — for mosques not on MAWAQIT
 *
 * Results are cached to AsyncStorage.
 */
export async function discoverNearbyIqama(
  lat: number,
  lon: number
): Promise<DiscoveredMosque[]> {
  // Fetch backend, MAWAQIT, and Overpass in parallel.
  // Overpass is a last-resort source; MAWAQIT is always used for enrichment.
  const localMosques = searchLocalMosques(lat, lon, 25);
  const [backendResponse, mawaqitMosques, overpassResponse] =
    await Promise.allSettled([
      fetchMosquesNearby(lat, lon, 25),
      searchNearby(lat, lon, 15000),
      // Always query Overpass — it supplements the local bundle with OSM data
      // that may not be in the bundled index yet (newly opened mosques, etc.)
      searchOverpassMosques(lat, lon, 25),
    ]);

  const backendMosques =
    backendResponse.status === "fulfilled"
      ? backendResponse.value.mosques
      : [];
  const mawaqit =
    mawaqitMosques.status === "fulfilled" ? mawaqitMosques.value : [];
  const overpass =
    overpassResponse.status === "fulfilled" ? overpassResponse.value : [];

  console.log(
    `[Discovery] sources — backend: ${backendMosques.length}, local: ${localMosques.length}, mawaqit: ${mawaqit.length}, overpass: ${overpass.length}`
  );

  // Source priority: backend (authoritative) → local bundle → Overpass (OSM)
  const sourceLabel =
    backendMosques.length > 0 ? "backend" :
    localMosques.length > 0 ? "local" : "overpass";
  const sourceMosques: DiscoveredMosque[] =
    backendMosques.length > 0
      ? backendMosques.map((m) => ({ ...m } as DiscoveredMosque))
      : localMosques.length > 0
      ? localMosques
      : overpass.map(mapOverpassToDiscovered);

  console.log(`[Discovery] using source: ${sourceLabel} (${sourceMosques.length} mosques)`);

  // Start with source mosques — backend (authoritative) or local bundle (offline fallback)
  const discovered: DiscoveredMosque[] = [];

  for (const bm of sourceMosques) {
    // If the mosque already has iqama times (backend schedules or local bundle), use them directly
    const hasBackendIqama =
      (bm as any).iqamaSchedules && (bm as any).iqamaSchedules.length > 0;
    const hasLocalIqama =
      bm.discoveredIqama && Object.keys(bm.discoveredIqama).length > 0;

    if (hasBackendIqama || hasLocalIqama) {
      discovered.push({
        ...bm,
        iqamaSource: (bm.iqamaSource as any) ?? "manual",
        iqamaLastFetched: bm.iqamaLastFetched ?? undefined,
      });
      continue;
    }

    // Backend mosque has no iqama yet — try MAWAQIT
    const mawaqitMatch = findBestMatch(mawaqit, bm.name, bm.latitude, bm.longitude);
    let discoveredIqama: IqamaTimes | undefined;
    let source: "mawaqit" | "website" | "manual" | undefined;

    if (mawaqitMatch) {
      const iqama = extractIqamaTimes(mawaqitMatch);
      if (Object.keys(iqama).length > 0) {
        discoveredIqama = iqama;
        source = "mawaqit";
      }
    }

    // Still nothing — try website scrape
    if (!discoveredIqama && bm.website) {
      const scraped = await scrapeWebsiteIqama(bm.website);
      if (Object.keys(scraped.iqamaTimes).length > 0) {
        discoveredIqama = scraped.iqamaTimes;
        source = "website";
      }
      // Merge scraped metadata onto the mosque record if not already set
      if (scraped.services && !(bm as any).services?.length) {
        (bm as any).services = scraped.services;
      }
      if (scraped.hours && !(bm as any).hours) {
        (bm as any).hours = scraped.hours;
      }
    }

    discovered.push({
      ...bm,
      discoveredIqama,
      iqamaSource: source,
      iqamaLastFetched: source ? new Date().toISOString() : bm.iqamaLastFetched,
    });
  }

  // Append MAWAQIT-only mosques not already covered by backend/local data
  // (new discoveries — will eventually be submitted/added to backend)
  for (const m of mawaqit) {
    const alreadyCovered = discovered.some(
      (d) => haversineKm(d.latitude, d.longitude, m.latitude, m.longitude) < 0.2
    );
    if (alreadyCovered) continue;

    discovered.push({
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
    });
  }

  // Append Overpass/OSM mosques not already covered (supplementary — fills
  // gaps for newly opened mosques not in backend/local bundle yet)
  for (const m of overpass) {
    const alreadyCovered = discovered.some(
      (d) => haversineKm(d.latitude, d.longitude, m.latitude, m.longitude) < 0.15
    );
    if (alreadyCovered) continue;
    discovered.push(mapOverpassToDiscovered(m));
  }

  // Sort by distance to user
  discovered.sort((a, b) =>
    haversineKm(lat, lon, a.latitude, a.longitude) -
    haversineKm(lat, lon, b.latitude, b.longitude)
  );

  const withIqama = discovered.filter(d => d.discoveredIqama && Object.keys(d.discoveredIqama).length > 0);
  console.log(`[Discovery] final: ${discovered.length} mosques, ${withIqama.length} with iqama times`);

  // Cache the merged results
  await setCached(nearbyMosquesKey(lat, lon), discovered);

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
  scrapedMeta?: { services?: string[]; hours?: string };
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
    // Search MAWAQIT by location — use 1 km radius so GPS drift doesn't miss the mosque
    const candidates = await searchNearby(mosque.latitude, mosque.longitude, 1000);
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
    const scraped = await scrapeWebsiteIqama(mosque.website);
    if (Object.keys(scraped.iqamaTimes).length > 0) {
      await cacheIqama(mosque.id, scraped.iqamaTimes, "website");
      return {
        iqamaTimes: scraped.iqamaTimes,
        source: "website",
        scrapedMeta: { services: scraped.services, hours: scraped.hours },
      };
    }
    // Even if no iqama times found, return any scraped metadata
    if (scraped.services || scraped.hours) {
      return {
        iqamaTimes: {},
        source: null,
        scrapedMeta: { services: scraped.services, hours: scraped.hours },
      };
    }
  }

  return { iqamaTimes: {}, source: null };
}

// ─── Website scraping (fallback) ─────────────────────────────────────────────

export interface ScrapedMosqueData {
  iqamaTimes: IqamaTimes;
  services?: string[];
  hours?: string;
}

/**
 * Fetch a mosque website and extract iqama times, services, and hours using regex.
 * Works for ~60% of mosque websites that post schedules as text.
 * No HTML parser needed — raw text matching is sufficient.
 */
export async function scrapeWebsiteIqama(url: string): Promise<ScrapedMosqueData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "LiveAzan/1.0 (mosque schedule lookup)" },
      signal: controller.signal,
    });
    if (!res.ok) return { iqamaTimes: {} };

    const html = await res.text();
    // Strip tags to get readable text
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    const iqamaTimes = parseIqamaFromText(text);
    const services = parseServicesFromText(text);
    const hours = parseHoursFromText(text);
    return {
      iqamaTimes,
      services: services.length > 0 ? services : undefined,
      hours: hours ?? undefined,
    };
  } catch {
    return { iqamaTimes: {} };
  } finally {
    clearTimeout(timeoutId);
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

/**
 * Detect service keywords from scraped mosque website text.
 * Always includes "five_daily_prayers" (assumed for any mosque).
 */
export function parseServicesFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const keywords: Array<[string, string]> = [
    ["funeral", "funeral_services"],
    ["janazah", "funeral_services"],
    ["janaza", "funeral_services"],
    ["nikah", "nikah"],
    ["marriage", "nikah"],
    ["counseling", "counseling"],
    ["counselling", "counseling"],
    ["quran class", "quran_classes"],
    ["quran circle", "quran_classes"],
    ["tahfeez", "tahfeez"],
    ["hifz", "tahfeez"],
    ["youth program", "youth_programs"],
    ["sisters circle", "sisters_halaqah"],
    ["ladies program", "sisters_halaqah"],
    ["women program", "sisters_halaqah"],
    ["new muslim", "new_muslim_support"],
    ["revert", "new_muslim_support"],
    ["taraweeh", "taraweeh"],
    ["eid", "eid_prayers"],
    ["islamic studies", "islamic_studies"],
  ];

  const found: string[] = ["five_daily_prayers"];
  for (const [keyword, serviceId] of keywords) {
    if (lower.indexOf(keyword) !== -1 && found.indexOf(serviceId) === -1) {
      found.push(serviceId);
    }
  }
  return found;
}

/**
 * Extract opening hours from scraped mosque website text.
 * Matches patterns like "Open 5am – 11pm daily", "Hours: 5:00am to 11pm", etc.
 */
export function parseHoursFromText(text: string): string | null {
  const hoursRe =
    /(?:open|hours?)[:\s]+(\d{1,2}(?::\d{2})?\s*[ap]m\s*[-–to]+\s*\d{1,2}(?::\d{2})?\s*[ap]m(?:\s+daily)?)/i;
  const match = hoursRe.exec(text);
  return match ? match[1].trim() : null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapOverpassToDiscovered(m: OverpassMosque): DiscoveredMosque {
  return {
    id: `osm_${m.latitude.toFixed(5)}_${m.longitude.toFixed(5)}`,
    name: m.name,
    type: "MOSQUE" as any,
    address: m.address,
    city: m.city,
    province: "",
    country: "",
    latitude: m.latitude,
    longitude: m.longitude,
    phone: m.phone ?? undefined,
    website: m.website ?? undefined,
    hasLiveStream: false,
    verified: false,
    iqamaSource: undefined,
    discoveredIqama: undefined,
  };
}

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
