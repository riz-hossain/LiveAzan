/**
 * Which mosque is which, and which is near.
 *
 * Three lists that describe the same mosques -- the app's own, MAWAQIT's and the
 * map's -- never quite agree on a name or on where the building is, and the wrong
 * match is worse than none: it hands one mosque's times to another. So two entries
 * are one mosque only when the evidence is strong, and a mosque with no times of its
 * own can borrow a neighbour's only in the open, labelled as the neighbour's.
 */

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
}

/** Great-circle distance in kilometres. Plenty exact at the scale of a city. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (![lat1, lon1, lat2, lon2].every((n) => Number.isFinite(n))) return Number.POSITIVE_INFINITY;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Lowercased and stripped of accents, for comparing names. */
export function fold(text: string): string {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Words that say "masjid" and nothing about which one.
const COMMON = new Set([
  "masjid", "mosque", "mosquee", "islamic", "islam", "centre", "center", "muslim", "association", "society",
  "community", "cultural", "the", "and", "canada", "canadian", "inc", "musalla", "musallah", "prayer", "hall",
  "jame", "jamia", "jami", "trust", "foundation", "education", "educational", "organization",
]);

function distinctive(name: string): Set<string> {
  return new Set((fold(name).match(/[a-z0-9]+/g) ?? []).filter((w) => !COMMON.has(w) && w.length > 2));
}

/** How far apart two entries can be and still be one masjid: a building is tens of metres across. */
const SAME_PLACE_KM = 0.25;
/** Farther than that, but this near and sharing a distinctive word in the name: lists put one building a few hundred metres apart. */
const NEAR_KM = 0.8;

/** Whether two entries, from different lists, are one mosque. */
export function samePlace(a: Place, b: Place): boolean {
  const gap = distanceKm(a.latitude, a.longitude, b.latitude, b.longitude);
  const nameA = fold(a.name);
  const nameB = fold(b.name);
  if (nameA && nameA === nameB && (gap <= 3 || gap === Number.POSITIVE_INFINITY)) return true;
  if (gap <= SAME_PLACE_KM) return true;
  if (gap > NEAR_KM) return false;
  const wordsB = distinctive(nameB);
  for (const w of distinctive(nameA)) if (wordsB.has(w)) return true;
  return false;
}

/**
 * The mosques around a target that have something to borrow, nearest first, each with
 * how far away it is. A mosque is never its own neighbour, nor one of the same name.
 */
export function neighbours<T extends Place>(
  target: Place,
  candidates: T[],
  options: { radiusKm?: number; usable?: (candidate: T) => boolean } = {}
): Array<{ place: T; km: number }> {
  const radius = options.radiusKm ?? 25;
  const out: Array<{ place: T; km: number }> = [];
  for (const candidate of candidates) {
    if (options.usable && !options.usable(candidate)) continue;
    if (fold(candidate.name) === fold(target.name)) continue;
    const km = distanceKm(target.latitude, target.longitude, candidate.latitude, candidate.longitude);
    if (km <= radius) out.push({ place: candidate, km });
  }
  out.sort((a, b) => a.km - b.km);
  return out;
}
