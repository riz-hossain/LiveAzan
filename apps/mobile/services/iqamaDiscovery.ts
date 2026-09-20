/**
 * Iqama discovery — runs entirely on the device.
 *
 * Source priority for the mosque list:
 *  1. Backend DB (authoritative, pre-enriched) — used when running
 *  2. Bundled local research data (offline, ships with the app)
 *  3. OpenStreetMap Overpass API (public, no auth, last resort)
 *
 * Iqama times:
 *  - In the list, only what is cheap and safe: the bundled research, and what
 *    MAWAQIT's one search request says for the mosques it lists.
 *  - For the mosque a person opens (refreshSingleMosqueIqama), everything: its own
 *    timetable plugin, its web page and its MAWAQIT listing, cross-checked, by the
 *    shared reader in packages/shared/src/iqama. That reader refuses what it cannot
 *    stand behind (a page for another season, a table that does not say which time
 *    is the iqama) rather than guess, because a wrong time is worse than none.
 *  - When a mosque publishes nothing that can be read, the nearest one that does can
 *    be offered (borrowNearbyIqama), labelled as the neighbour's and approximate.
 *
 * No backend proxy is needed — native apps can call any API directly.
 */

import type { Mosque, IqamaSchedule } from "@live-azan/shared";
import {
  Prayer,
  borrowFromNeighbour,
  distanceKm,
  metaFromBorrowed,
  metaFromOutcome,
  mosqueDay,
  readMosque,
  type FetchText,
  type IqamaMeta,
  type MosqueInput,
} from "@live-azan/shared";
import { fetchMosquesNearby } from "./api";
import { findMatch, searchNearby, type IqamaTimes } from "./mawaqitService";
import { fetchText } from "./http";
import { setCached, nearbyMosquesKey } from "./cache";
import { searchLocalMosques } from "./localMosqueSearch";
import { searchOverpassMosques, type OverpassMosque } from "./overpassService";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DiscoveredMosque extends Mosque {
  discoveredIqama?: IqamaTimes;   // iqama times found for the list (bundled research, or MAWAQIT's search)
  maghribRule?: string;           // how the research recorded Maghrib when it was not a clock time: "sunset+5"
  iqamaSource?: "mawaqit" | "website" | "plugin" | "nearby" | "manual";
  iqamaLastFetched?: string;      // ISO string; for bundled research, the day it was researched
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Discover nearby mosques and what is cheaply known of their iqama times.
 *
 *  1. Our backend (pre-enriched, curated) — use iqamaSchedules if present
 *  2. The bundled research — kept as saved times, labelled as such where shown
 *  3. MAWAQIT's search, for a mosque with nothing yet — only a strong match by name
 *     and place counts
 *
 * Websites are not read here: that is a few requests a mosque and the list can be
 * dozens long. They are read for the one a person opens.
 *
 * The list is cached to AsyncStorage. Per-mosque iqama is not: what is cached for a
 * mosque is what was last read for it, and a list of bundled research must not
 * overwrite that.
 */
export async function discoverNearbyIqama(
  lat: number,
  lon: number
): Promise<DiscoveredMosque[]> {
  // Fetch backend, MAWAQIT, and Overpass in parallel.
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

  const discovered: DiscoveredMosque[] = [];

  for (const bm of sourceMosques) {
    // Times the mosque already came with (backend schedules, or the bundled research) are kept.
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

    // No times yet — is it on MAWAQIT? Only if the listing is this mosque.
    const match = findMatch(mawaqit, bm);
    discovered.push({
      ...bm,
      ...(match?.day
        ? {
            discoveredIqama: match.day.iqama,
            iqamaSource: "mawaqit" as const,
            iqamaLastFetched: new Date().toISOString(),
            mawaqitId: bm.mawaqitId ?? match.uuid,
          }
        : {}),
    });
  }

  // Append MAWAQIT-only mosques not already covered by backend/local data
  // (new discoveries — will eventually be submitted/added to backend)
  for (const m of mawaqit) {
    const alreadyCovered = discovered.some(
      (d) => distanceKm(d.latitude, d.longitude, m.latitude, m.longitude) < 0.2
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
      ...(m.day
        ? {
            iqamaSource: "mawaqit" as const,
            iqamaLastFetched: new Date().toISOString(),
            discoveredIqama: m.day.iqama,
          }
        : {}),
    });
  }

  // Append Overpass/OSM mosques not already covered (supplementary — fills
  // gaps for newly opened mosques not in backend/local bundle yet)
  for (const m of overpass) {
    const alreadyCovered = discovered.some(
      (d) => distanceKm(d.latitude, d.longitude, m.latitude, m.longitude) < 0.15
    );
    if (alreadyCovered) continue;
    discovered.push(mapOverpassToDiscovered(m));
  }

  // Sort by distance to user
  discovered.sort((a, b) =>
    distanceKm(lat, lon, a.latitude, a.longitude) -
    distanceKm(lat, lon, b.latitude, b.longitude)
  );

  const withIqama = discovered.filter(d => d.discoveredIqama && Object.keys(d.discoveredIqama).length > 0);
  console.log(`[Discovery] final: ${discovered.length} mosques, ${withIqama.length} with iqama times`);

  await setCached(nearbyMosquesKey(lat, lon), discovered);
  return discovered;
}

// ─── One mosque, read properly ───────────────────────────────────────────────

export interface RefreshResult {
  /** All five, or nothing: a reading that could not be stood behind is not shown. */
  times: IqamaTimes;
  jumuah?: string;
  meta: IqamaMeta | null;
  /** Why the sources that failed failed, in words for a person. */
  problems: string[];
  scrapedMeta?: { services?: string[]; hours?: string };
}

/** Longest a person is asked to wait for one mosque. The reader gives up on what is left after this. */
const READ_BUDGET_MS = 45_000;

function toInput(mosque: Mosque): MosqueInput {
  return {
    name: mosque.name,
    latitude: mosque.latitude,
    longitude: mosque.longitude,
    website: mosque.website ?? null,
    mawaqitId: mosque.mawaqitId ?? null,
  };
}

/**
 * Read one mosque's iqama times for today: the mosque's own timetable plugin, its web
 * page and its MAWAQIT listing, checked against each other and the sun. Nothing comes
 * back when nothing could be stood behind, with the reasons in `problems`.
 */
export async function refreshSingleMosqueIqama(
  mosque: Mosque,
  now: Date = new Date()
): Promise<RefreshResult> {
  const { today, where } = mosqueDay(mosque, now);

  // The home page, kept as it goes by, for the services and opening hours it mentions.
  let homeHtml = "";
  const home = (mosque.website ?? "").replace(/\/+$/, "");
  const capture: FetchText = async (url, options) => {
    const res = await fetchText(url, options);
    if (!homeHtml && home && url.replace(/\/+$/, "") === home && res.status < 400 && /html/i.test(res.contentType)) {
      homeHtml = res.body;
    }
    return res;
  };

  const outcome = await readMosque(toInput(mosque), {
    fetchText: capture,
    today,
    where,
    budgetMs: READ_BUDGET_MS,
    log: (message) => console.log(`[Iqama] ${mosque.name}: ${message}`),
  });

  let scrapedMeta: RefreshResult["scrapedMeta"];
  if (homeHtml) {
    const text = homeHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const services = parseServicesFromText(text);
    const hours = parseHoursFromText(text);
    if (services.length > 0 || hours) {
      scrapedMeta = { services: services.length > 0 ? services : undefined, hours: hours ?? undefined };
    }
  }

  return {
    times: outcome.reading?.times ?? {},
    ...(outcome.reading?.jumuah ? { jumuah: outcome.reading.jumuah } : {}),
    meta: metaFromOutcome(outcome),
    problems: outcome.problems,
    scrapedMeta,
  };
}

/**
 * When a mosque publishes nothing that can be read: the nearest one that does, from
 * the mosques already known nearby. The result is that neighbour's, said so in its
 * meta, and it is the caller's to show as approximate — never as this mosque's own.
 */
export async function borrowNearbyIqama(
  mosque: Mosque,
  nearby: Mosque[],
  now: Date = new Date()
): Promise<{ times: IqamaTimes; jumuah?: string; meta: IqamaMeta } | null> {
  const { today, where } = mosqueDay(mosque, now);
  const candidates = nearby
    .filter((m) => m.id !== mosque.id && (m.website || m.mawaqitId))
    .map(toInput);
  const borrowed = await borrowFromNeighbour(
    toInput(mosque),
    candidates,
    { fetchText, today, where, log: (message) => console.log(`[Iqama] nearby: ${message}`) },
    { radiusKm: 25, tries: 4, budgetMs: 60_000 }
  );
  if (!borrowed) return null;
  return {
    times: borrowed.reading.times,
    ...(borrowed.reading.jumuah ? { jumuah: borrowed.reading.jumuah } : {}),
    meta: metaFromBorrowed(borrowed),
  };
}

// ─── Services and hours (scraped from the home page) ──────────────────────────

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

/**
 * The rows the screens and the store keep for a mosque's times: one per prayer, and
 * Jumu'ah when it is known.
 */
export function schedulesFor(
  mosqueId: string,
  times: IqamaTimes,
  jumuah: string | undefined,
  kind: string
): IqamaSchedule[] {
  const now = new Date().toISOString();
  const prayerMap: Array<[keyof IqamaTimes, Prayer]> = [
    ["fajr", Prayer.FAJR],
    ["dhuhr", Prayer.DHUHR],
    ["asr", Prayer.ASR],
    ["maghrib", Prayer.MAGHRIB],
    ["isha", Prayer.ISHA],
  ];

  const rows: IqamaSchedule[] = prayerMap
    .filter(([key]) => times[key])
    .map(([key, prayer]) => ({
      id: `${mosqueId}_${prayer}_${kind}`,
      mosqueId,
      prayer,
      iqamaTime: times[key]!,
      effectiveFrom: now,
    }));
  if (jumuah) {
    rows.push({
      id: `${mosqueId}_${Prayer.JUMMAH}_${kind}`,
      mosqueId,
      prayer: Prayer.JUMMAH,
      iqamaTime: jumuah,
      effectiveFrom: now,
    });
  }
  return rows;
}
