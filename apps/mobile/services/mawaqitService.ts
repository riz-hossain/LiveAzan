/**
 * MAWAQIT search — runs directly on the device (no backend proxy needed).
 *
 * MAWAQIT (mawaqit.net) is a free, open mosque management platform where mosques
 * self-publish their iqama schedules. No API key is needed to read public data.
 *
 * One request answers for a whole neighbourhood: each result carries today's adhan
 * and iqama, so a list of mosques can be filled in cheaply. What a mosque's own page
 * says is read later, for the one mosque a person opens (see iqamaDiscovery.ts).
 *
 * The address, the radius (kilometres, not metres) and the reading of a result all
 * come from the shared reader, which is tested against MAWAQIT's real responses.
 */

import {
  mawaqitDayFromSearch,
  mawaqitSearchUrl,
  parseMawaqitSearch,
  samePlace,
  distanceKm,
  type DayTimes,
  type IqamaTimes,
} from "@live-azan/shared";
import { fetchText } from "./http";

export type { IqamaTimes };

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MawaqitMosque {
  uuid: string;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Today's iqama, when the listing has all five and has not switched them off. */
  day: DayTimes | null;
}

// ─── API calls ───────────────────────────────────────────────────────────────

/**
 * Search mosques near a lat/lon within the given radius (metres, rounded up to whole
 * kilometres, which is what MAWAQIT takes).
 */
export async function searchNearby(
  lat: number,
  lon: number,
  radiusMeters: number = 5000
): Promise<MawaqitMosque[]> {
  const radiusKm = Math.max(1, Math.ceil(radiusMeters / 1000));
  try {
    const res = await fetchText(mawaqitSearchUrl(lat, lon, radiusKm), { timeoutMs: 10_000 });
    console.log(`[MAWAQIT] Search HTTP ${res.status} for (${lat},${lon}) r=${radiusKm}km`);
    if (res.status >= 400) return [];
    const found: MawaqitMosque[] = [];
    for (const item of parseMawaqitSearch(JSON.parse(res.body))) {
      if (typeof item.latitude !== "number" || typeof item.longitude !== "number" || !item.slug) continue;
      found.push({
        uuid: item.uuid ?? item.slug,
        slug: item.slug,
        name: item.name ?? item.label ?? item.slug,
        latitude: item.latitude,
        longitude: item.longitude,
        day: mawaqitDayFromSearch(item),
      });
    }
    console.log(`[MAWAQIT] Search returned ${found.length} mosques`);
    return found;
  } catch (err) {
    console.warn("[MAWAQIT] Search failed:", err);
    return [];
  }
}

// ─── Matching ────────────────────────────────────────────────────────────────

/**
 * The listing that is this mosque, or null. Names and coordinates in different lists
 * never quite agree, and handing one mosque's times to another is worse than showing
 * none, so only a strong match counts (same name nearby, or the same building).
 */
export function findMatch(
  candidates: MawaqitMosque[],
  ours: { name: string; latitude: number; longitude: number }
): MawaqitMosque | null {
  let best: MawaqitMosque | null = null;
  let bestKm = Infinity;
  for (const c of candidates) {
    if (!samePlace(ours, c)) continue;
    const km = distanceKm(ours.latitude, ours.longitude, c.latitude, c.longitude);
    if (km < bestKm) {
      best = c;
      bestKm = km;
    }
  }
  return best;
}
