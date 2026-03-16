/**
 * MAWAQIT API client — runs directly on the device (no backend proxy needed).
 *
 * MAWAQIT (mawaqit.net) is a free, open mosque management platform where
 * mosques self-publish their iqama schedules. It has 8,000+ mosques globally.
 * No API key required for reading public mosque data.
 *
 * API base: https://mawaqit.net/en/api/2.0
 */

const MAWAQIT_BASE = "https://mawaqit.net/en/api/2.0";

// Some public APIs block the default React Native UA; a browser-style UA unblocks them.
const MAWAQIT_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MawaqitMosque {
  uuid: string;
  name: string;
  label?: string;
  type?: string;
  latitude: number;
  longitude: number;
  // Iqama calendar: keys are month numbers "1"–"12",
  // values are arrays [fajr, dhuhr, asr, maghrib, isha] in "HH:mm" format.
  // Some entries may be null (use adhan time directly).
  iqamaCalendar?: Record<string, (string | null)[]>;
  // Current month's prayer times (adhan), indexed as:
  // [fajr, shuruk, dhuhr, asr, maghrib, isha]
  times?: string[];
  // Iqama offsets in minutes from adhan (fallback if no iqamaCalendar)
  iqama?: (number | null)[];
}

export type IqamaTimes = {
  fajr?: string;
  dhuhr?: string;
  asr?: string;
  maghrib?: string;
  isha?: string;
};

// ─── API calls ───────────────────────────────────────────────────────────────

/**
 * Search mosques near a lat/lon within the given radius (metres).
 * Returns up to ~20 nearest mosques.
 */
export async function searchNearby(
  lat: number,
  lon: number,
  radiusMeters: number = 5000
): Promise<MawaqitMosque[]> {
  const url =
    `${MAWAQIT_BASE}/mosque/search` +
    `?lat=${lat}&lon=${lon}&radius=${radiusMeters}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: MAWAQIT_HEADERS,
      signal: controller.signal,
    });
    console.log(`[MAWAQIT] Search HTTP ${res.status} for (${lat},${lon}) r=${radiusMeters}m`);
    if (!res.ok) {
      console.warn(`[MAWAQIT] Search returned HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    // API may return array directly or { mosques: [] }
    const results = Array.isArray(data) ? data : (data.mosques ?? []);
    console.log(`[MAWAQIT] Search returned ${results.length} mosques`);
    return results;
  } catch (err) {
    console.warn("[MAWAQIT] Search failed:", err);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch full mosque details (including iqamaCalendar) by MAWAQIT UUID.
 */
export async function getByUuid(uuid: string): Promise<MawaqitMosque | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${MAWAQIT_BASE}/mosque/${uuid}`, {
      headers: MAWAQIT_HEADERS,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[MAWAQIT] getByUuid ${uuid} returned HTTP ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn("[MAWAQIT] getByUuid failed:", err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Matching ────────────────────────────────────────────────────────────────

/**
 * Find the best MAWAQIT match for our mosque from a candidate list.
 * Scores by: name similarity (Jaccard) + distance (haversine).
 */
export function findBestMatch(
  candidates: MawaqitMosque[],
  ourName: string,
  ourLat: number,
  ourLon: number
): MawaqitMosque | null {
  let best: MawaqitMosque | null = null;
  let bestScore = -1;

  for (const c of candidates) {
    const dist = haversineKm(ourLat, ourLon, c.latitude, c.longitude);
    if (dist > 0.5) continue; // >500m away — skip

    const sim = jaccardSimilarity(ourName.toLowerCase(), c.name.toLowerCase());
    if (sim < 0.25) continue; // names too different

    // Score: name similarity weighted 60%, proximity 40%
    const proxScore = Math.max(0, 1 - dist / 0.5);
    const score = 0.6 * sim + 0.4 * proxScore;

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best;
}

// ─── Iqama extraction ────────────────────────────────────────────────────────

/**
 * Extract iqama times from a MAWAQIT mosque object.
 * Tries iqamaCalendar first (actual times), falls back to iqama offsets
 * applied to the current month's adhan times.
 */
export function extractIqamaTimes(mosque: MawaqitMosque): IqamaTimes {
  const month = String(new Date().getMonth() + 1); // "1"–"12"

  // Strategy 1: iqamaCalendar has actual HH:mm iqama times
  if (mosque.iqamaCalendar) {
    const monthEntry =
      mosque.iqamaCalendar[month] || mosque.iqamaCalendar["1"];
    if (monthEntry && monthEntry.length >= 5) {
      const result: IqamaTimes = {};
      const prayerMap: (keyof IqamaTimes)[] = [
        "fajr",
        "dhuhr",
        "asr",
        "maghrib",
        "isha",
      ];
      for (let i = 0; i < prayerMap.length; i++) {
        const t = monthEntry[i];
        if (t && isValidTime(t)) {
          result[prayerMap[i]] = normalizeTime(t);
        }
      }
      if (Object.keys(result).length > 0) return result;
    }
  }

  // Strategy 2: iqama offsets + adhan times → compute iqama
  if (mosque.iqama && mosque.times) {
    const result: IqamaTimes = {};
    // MAWAQIT times[] indices: 0=fajr, 1=shuruk, 2=dhuhr, 3=asr, 4=maghrib, 5=isha
    // MAWAQIT iqama[] indices: 0=fajr, 1=dhuhr, 2=asr, 3=maghrib, 4=isha
    const adhanMap = [0, 2, 3, 4, 5]; // times[] index for each prayer
    const prayerMap: (keyof IqamaTimes)[] = [
      "fajr",
      "dhuhr",
      "asr",
      "maghrib",
      "isha",
    ];

    for (let i = 0; i < prayerMap.length; i++) {
      const offset = mosque.iqama[i];
      const adhan = mosque.times[adhanMap[i]];
      if (offset != null && adhan && isValidTime(adhan)) {
        result[prayerMap[i]] = addMinutes(adhan, offset);
      }
    }
    if (Object.keys(result).length > 0) return result;
  }

  return {};
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

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 2));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  return intersection / Math.max(wordsA.size, wordsB.size);
}

function isValidTime(t: string): boolean {
  return /^\d{1,2}:\d{2}/.test(t);
}

/** Normalize "6:30 AM" / "06:30" / "18:30" → "HH:mm" 24h format */
export function normalizeTime(t: string): string {
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
  // Already in HH:mm or H:mm
  const match24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return `${String(parseInt(match24[1], 10)).padStart(2, "0")}:${match24[2]}`;
  }
  return t;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}
