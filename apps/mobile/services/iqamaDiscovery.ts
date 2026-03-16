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
 * Fetch a mosque website and extract iqama times, services, and hours.
 * Strategy:
 *  1. Fetch the main page.
 *  2. If no iqama times found, search the page for "full year" / "prayer schedule"
 *     links and follow the first match.
 *  3. Parse HTML tables for structured prayer time data.
 *  4. Fall back to plain-text regex if tables don't yield results.
 */
export async function scrapeWebsiteIqama(url: string): Promise<ScrapedMosqueData> {
  const html = await fetchPage(url);
  if (!html) return { iqamaTimes: {} };

  const text = htmlToText(html);
  const services = parseServicesFromText(text);
  const hours = parseHoursFromText(text);

  // Try table parsing first (more structured, more accurate)
  let iqamaTimes = parseIqamaFromHtmlTables(html);

  // Fall back to text-based parsing
  if (Object.keys(iqamaTimes).length === 0) {
    iqamaTimes = parseIqamaFromText(text);
  }

  // If still nothing found, look for a "full year" or "prayer schedule" sub-page
  if (Object.keys(iqamaTimes).length === 0) {
    const scheduleUrl = findScheduleLink(html, url);
    if (scheduleUrl) {
      const subHtml = await fetchPage(scheduleUrl);
      if (subHtml) {
        const subText = htmlToText(subHtml);
        iqamaTimes = parseIqamaFromHtmlTables(subHtml);
        if (Object.keys(iqamaTimes).length === 0) {
          iqamaTimes = parseIqamaFromText(subText);
        }
      }
    }
  }

  return {
    iqamaTimes,
    services: services.length > 0 ? services : undefined,
    hours: hours ?? undefined,
  };
}

async function fetchPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function htmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

/**
 * Find a link to a "full year prayer times" or "prayer schedule" page.
 * Returns the absolute URL or null.
 */
function findScheduleLink(html: string, baseUrl: string): string | null {
  // Matches href attributes in <a> tags
  const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  const scheduleKeywords =
    /full.year|prayer.time|prayer.schedule|iqama.schedule|salah.time|namaz.time|annual.schedule|monthly.schedule/i;

  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null) {
    const href = match[1];
    const label = match[2];
    if (scheduleKeywords.test(label) || scheduleKeywords.test(href)) {
      // Resolve to absolute URL
      if (/^https?:\/\//i.test(href)) return href;
      try {
        return new URL(href, baseUrl).href;
      } catch {
        // Ignore malformed URLs
      }
    }
  }
  return null;
}

/**
 * Parse iqama times from HTML tables.
 * Looks for tables where one column contains prayer names and another
 * contains time values (supports multi-column layouts).
 */
export function parseIqamaFromHtmlTables(html: string): IqamaTimes {
  const result: IqamaTimes = {};

  // Extract all table rows
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  const rowRe = /<tr[\s\S]*?<\/tr>/gi;
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

  const prayerNames: Record<string, keyof IqamaTimes> = {
    fajr: "fajr", fajar: "fajr",
    dhuhr: "dhuhr", zuhr: "dhuhr", zohr: "dhuhr",
    asr: "asr",
    maghrib: "maghrib", magrib: "maghrib",
    isha: "isha", esha: "isha",
  };

  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRe.exec(html)) !== null) {
    const tableHtml = tableMatch[0];
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[0];
      const cells: string[] = [];

      let cellMatch: RegExpExecArray | null;
      cellRe.lastIndex = 0;
      while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
        // Strip inner tags and decode common HTML entities
        const cellText = cellMatch[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&nbsp;/g, " ")
          .trim();
        cells.push(cellText);
      }

      if (cells.length < 2) continue;

      // Check if first cell is a prayer name
      const firstCell = cells[0].toLowerCase().trim();
      const prayer = prayerNames[firstCell];
      if (!prayer || result[prayer]) continue;

      // Look for a valid time in the remaining cells (prefer iqama column if labeled)
      // Common table layouts: [Prayer | Adhan | Iqama] or [Prayer | Iqama]
      const timeRe = /\b(\d{1,2}:\d{2})\s*(am|pm)?/i;
      // If there are 3+ cells, pick the last time value (most likely iqama)
      for (let i = cells.length - 1; i >= 1; i--) {
        const m = timeRe.exec(cells[i]);
        if (m) {
          const raw = m[1] + (m[2] ? ` ${m[2]}` : "");
          result[prayer] = normalizeTime(raw);
          break;
        }
      }
    }

    if (Object.keys(result).length >= 4) break; // enough data found
  }

  return result;
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
