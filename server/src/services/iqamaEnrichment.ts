/**
 * Iqama enrichment service — queries MAWAQIT and mosque websites to find
 * iqama times for mosques that don't have them yet, then persists to DB.
 *
 * Source priority:
 *  1. MAWAQIT API  — mosques that self-publish iqama schedules
 *  2. Website scrape — regex on the mosque's own website HTML
 *
 * Used by:
 *  - server/src/jobs/iqamaRefreshJob.ts  (monthly cron)
 *  - server/src/routes/admin.ts          (manual admin trigger)
 */

import { prisma } from "../lib/prisma";
import { Prayer } from "@prisma/client";

// ─── MAWAQIT types (mirrors apps/mobile/services/mawaqitService.ts) ──────────

interface MawaqitMosque {
  uuid: string;
  name: string;
  latitude: number;
  longitude: number;
  iqamaCalendar?: Record<string, (string | null)[]>;
  times?: string[];
  iqama?: (number | null)[];
}

type IqamaTimes = Partial<Record<"fajr" | "dhuhr" | "asr" | "maghrib" | "isha", string>>;

// ─── Public result types ──────────────────────────────────────────────────────

export interface EnrichmentResult {
  mosqueId: string;
  mosqueName: string;
  source: "mawaqit" | "website" | null;
  prayersFound: string[];
  alreadyUpToDate: boolean;
  skipped: boolean;
}

export interface EnrichmentReport {
  city: string;
  province: string;
  total: number;
  enriched: number;
  alreadyUpToDate: number;
  skipped: number;
  stillMissing: string[]; // mosque names
}

const MAWAQIT_BASE = "https://mawaqit.net/en/api/2.0";
const STALE_DAYS = 30;
const RATE_LIMIT_MS = 250; // pause between mosque API calls

// ─── Main entry points ────────────────────────────────────────────────────────

/**
 * Enrich iqama times for a single mosque in the DB.
 * Skips if iqamaLastFetched is within STALE_DAYS (unless force=true).
 */
export async function enrichMosque(
  mosqueId: string,
  force = false
): Promise<EnrichmentResult> {
  const mosque = await prisma.mosque.findUnique({ where: { id: mosqueId } });
  if (!mosque) {
    return { mosqueId, mosqueName: "unknown", source: null, prayersFound: [], alreadyUpToDate: false, skipped: true };
  }

  // Skip if recently fetched
  if (!force && mosque.iqamaLastFetched) {
    const age = Date.now() - mosque.iqamaLastFetched.getTime();
    if (age < STALE_DAYS * 24 * 60 * 60 * 1000) {
      return { mosqueId, mosqueName: mosque.name, source: null, prayersFound: [], alreadyUpToDate: true, skipped: false };
    }
  }

  // Source 1: MAWAQIT
  const mawaqitResult = await tryMawaqit(mosque);
  if (mawaqitResult) {
    const saved = await upsertIqama(mosque.id, mawaqitResult.times, mawaqitResult.uuid);
    return {
      mosqueId,
      mosqueName: mosque.name,
      source: "mawaqit",
      prayersFound: saved,
      alreadyUpToDate: false,
      skipped: false,
    };
  }

  // Source 2: Website scrape
  if (mosque.website) {
    const scraped = await scrapeWebsiteIqama(mosque.website);
    if (Object.keys(scraped).length > 0) {
      const saved = await upsertIqama(mosque.id, scraped, null);
      return {
        mosqueId,
        mosqueName: mosque.name,
        source: "website",
        prayersFound: saved,
        alreadyUpToDate: false,
        skipped: false,
      };
    }
  }

  // Nothing found — update lastFetched anyway to avoid re-querying too soon
  await prisma.mosque.update({
    where: { id: mosqueId },
    data: { iqamaLastFetched: new Date() },
  });

  return { mosqueId, mosqueName: mosque.name, source: null, prayersFound: [], alreadyUpToDate: false, skipped: false };
}

/**
 * Enrich all mosques in a city. Returns a summary report.
 */
export async function enrichCity(
  city: string,
  province: string,
  force = false
): Promise<EnrichmentReport> {
  const mosques = await prisma.mosque.findMany({
    where: {
      city: { equals: city, mode: "insensitive" },
      province: { equals: province, mode: "insensitive" },
    },
    select: { id: true, name: true, iqamaLastFetched: true },
  });

  const report: EnrichmentReport = {
    city,
    province,
    total: mosques.length,
    enriched: 0,
    alreadyUpToDate: 0,
    skipped: 0,
    stillMissing: [],
  };

  for (const mosque of mosques) {
    const result = await enrichMosque(mosque.id, force);
    if (result.alreadyUpToDate) {
      report.alreadyUpToDate++;
    } else if (result.prayersFound.length > 0) {
      report.enriched++;
    } else if (!result.skipped) {
      report.stillMissing.push(mosque.name);
    } else {
      report.skipped++;
    }
    await sleep(RATE_LIMIT_MS);
  }

  return report;
}

/**
 * Find distinct cities from users' primary mosques (active cities).
 */
export async function getActiveCities(): Promise<Array<{ city: string; province: string }>> {
  const rows = await prisma.userMosque.findMany({
    where: { isPrimary: true },
    include: { mosque: { select: { city: true, province: true } } },
    distinct: ["mosqueId"],
  });

  const seen = new Set<string>();
  const cities: Array<{ city: string; province: string }> = [];
  for (const row of rows) {
    const key = `${row.mosque.city}|${row.mosque.province}`;
    if (!seen.has(key)) {
      seen.add(key);
      cities.push({ city: row.mosque.city, province: row.mosque.province });
    }
  }
  return cities;
}

// ─── MAWAQIT helpers ──────────────────────────────────────────────────────────

async function tryMawaqit(
  mosque: { id: string; name: string; latitude: number; longitude: number; mawaqitId: string | null }
): Promise<{ times: IqamaTimes; uuid: string } | null> {
  try {
    // Known MAWAQIT UUID → fetch directly
    if (mosque.mawaqitId) {
      const full = await mawaqitGetByUuid(mosque.mawaqitId);
      if (full) {
        const times = extractIqamaTimes(full);
        if (Object.keys(times).length > 0) return { times, uuid: mosque.mawaqitId };
      }
    }

    // Unknown → search nearby (300m radius)
    const candidates = await mawaqitSearchNearby(mosque.latitude, mosque.longitude, 300);
    const match = mawaqitFindBestMatch(candidates, mosque.name, mosque.latitude, mosque.longitude);
    if (!match) return null;

    const full = await mawaqitGetByUuid(match.uuid);
    const times = extractIqamaTimes(full ?? match);
    if (Object.keys(times).length === 0) return null;

    return { times, uuid: match.uuid };
  } catch {
    return null;
  }
}

async function mawaqitSearchNearby(lat: number, lon: number, radiusM: number): Promise<MawaqitMosque[]> {
  try {
    const res = await fetch(
      `${MAWAQIT_BASE}/mosque/search?lat=${lat}&lon=${lon}&radius=${radiusM}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.mosques ?? []);
  } catch {
    return [];
  }
}

async function mawaqitGetByUuid(uuid: string): Promise<MawaqitMosque | null> {
  try {
    const res = await fetch(`${MAWAQIT_BASE}/mosque/${uuid}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function mawaqitFindBestMatch(
  candidates: MawaqitMosque[],
  name: string,
  lat: number,
  lon: number
): MawaqitMosque | null {
  let best: MawaqitMosque | null = null;
  let bestScore = -1;

  for (const c of candidates) {
    const dist = haversineKm(lat, lon, c.latitude, c.longitude);
    if (dist > 0.3) continue;
    const sim = jaccardSimilarity(name.toLowerCase(), c.name.toLowerCase());
    if (sim < 0.4) continue;
    const score = 0.6 * sim + 0.4 * Math.max(0, 1 - dist / 0.3);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function extractIqamaTimes(mosque: MawaqitMosque): IqamaTimes {
  const month = String(new Date().getMonth() + 1);
  const prayerKeys = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;

  if (mosque.iqamaCalendar) {
    const entry = mosque.iqamaCalendar[month] ?? mosque.iqamaCalendar["1"];
    if (entry && entry.length >= 5) {
      const result: IqamaTimes = {};
      for (let i = 0; i < prayerKeys.length; i++) {
        const t = entry[i];
        if (t && /^\d{1,2}:\d{2}/.test(t)) result[prayerKeys[i]] = normalizeTime(t);
      }
      if (Object.keys(result).length > 0) return result;
    }
  }

  if (mosque.iqama && mosque.times) {
    const adhanIdx = [0, 2, 3, 4, 5];
    const result: IqamaTimes = {};
    for (let i = 0; i < prayerKeys.length; i++) {
      const offset = mosque.iqama[i];
      const adhan = mosque.times[adhanIdx[i]];
      if (offset != null && adhan && /^\d{1,2}:\d{2}/.test(adhan)) {
        result[prayerKeys[i]] = addMinutes(adhan, offset);
      }
    }
    if (Object.keys(result).length > 0) return result;
  }

  return {};
}

// ─── Website scraping ─────────────────────────────────────────────────────────

async function scrapeWebsiteIqama(url: string): Promise<IqamaTimes> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "LiveAzan/1.0 (mosque schedule lookup)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return {};
    const html = await res.text();
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    return parseIqamaFromText(text);
  } catch {
    return {};
  }
}

function parseIqamaFromText(text: string): IqamaTimes {
  const result: IqamaTimes = {};
  const lower = text.toLowerCase();
  const patterns: Array<[keyof IqamaTimes, RegExp]> = [
    ["fajr",    /fajr/],
    ["dhuhr",   /dhuhr|zuhr|zohr/],
    ["asr",     /asr|'asr/],
    ["maghrib", /maghrib|magrib/],
    ["isha",    /isha|'isha|esha/],
  ];
  const timeRe = /(\d{1,2}:\d{2})\s*(am|pm)?/gi;

  for (const [prayer, nameRe] of patterns) {
    const idx = lower.search(nameRe);
    if (idx === -1) continue;
    const slice = text.slice(idx, idx + 100);
    timeRe.lastIndex = 0;
    const m = timeRe.exec(slice);
    if (m) {
      const raw = m[1] + (m[2] ? ` ${m[2]}` : "");
      result[prayer] = normalizeTime(raw);
    }
  }

  return result;
}

// ─── DB upsert ────────────────────────────────────────────────────────────────

const PRAYER_MAP: Record<string, Prayer> = {
  fajr: Prayer.FAJR,
  dhuhr: Prayer.DHUHR,
  asr: Prayer.ASR,
  maghrib: Prayer.MAGHRIB,
  isha: Prayer.ISHA,
};

/**
 * Upsert IqamaSchedule rows for found prayers, update mosque metadata.
 * Returns list of prayer names that were saved.
 */
async function upsertIqama(
  mosqueId: string,
  times: IqamaTimes,
  mawaqitUuid: string | null
): Promise<string[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const saved: string[] = [];

  for (const [prayerKey, iqamaTime] of Object.entries(times)) {
    const prayer = PRAYER_MAP[prayerKey];
    if (!prayer || !iqamaTime) continue;

    // Close off any previously open schedule for this prayer
    await prisma.iqamaSchedule.updateMany({
      where: { mosqueId, prayer, effectiveTo: null },
      data: { effectiveTo: today },
    });

    // Insert new schedule
    await prisma.iqamaSchedule.create({
      data: {
        mosqueId,
        prayer,
        iqamaTime,
        effectiveFrom: today,
        effectiveTo: null,
      },
    });

    saved.push(prayerKey);
  }

  // Update mosque metadata
  await prisma.mosque.update({
    where: { id: mosqueId },
    data: {
      ...(mawaqitUuid ? { mawaqitId: mawaqitUuid } : {}),
      iqamaSource: mawaqitUuid ? "mawaqit" : "website",
      iqamaLastFetched: new Date(),
    },
  });

  return saved;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 2));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  return intersection / Math.max(wordsA.size, wordsB.size);
}

function normalizeTime(t: string): string {
  t = t.trim();
  const match12 = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2];
    const period = match12[3].toLowerCase();
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  const match24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) return `${String(parseInt(match24[1], 10)).padStart(2, "0")}:${match24[2]}`;
  return t;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
