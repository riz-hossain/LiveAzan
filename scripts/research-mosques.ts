/**
 * Mosque research tool — scrapes free data sources to find mosques/musallas,
 * then auto-fetches iqama times from MAWAQIT for any matched mosques.
 *
 * Usage:
 *   npx tsx scripts/research-mosques.ts --city "Toronto" --province "Ontario"
 *   npx tsx scripts/research-mosques.ts --city "Ottawa" --province "Ontario" --radius 50
 *
 * Data Sources (all free, no API key required):
 * 1. OpenStreetMap Overpass API — all "amenity=place_of_worship" + "religion=muslim"
 * 2. MAWAQIT API — matches discovered mosques and pre-fills iqama times
 * 3. Existing seed data — merges with what we already have
 *
 * Output: data/mosques/canada/<province>/<city>.json
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Args {
  city: string;
  province: string;
  country: string;
  radius: number;
}

interface RawMosque {
  name: string;
  type: "mosque" | "musalla";
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  phone?: string;
  website?: string;
  googleRating?: number;
  googleReviewCount?: number;
  source: string;
  notes?: string;
}

interface MawaqitMosque {
  uuid: string;
  name: string;
  latitude: number;
  longitude: number;
  iqamaCalendar?: Record<string, (string | null)[]>;
  times?: string[];
  iqama?: (number | null)[];
}

interface IqamaTimes {
  fajr?: string;
  dhuhr?: string;
  asr?: string;
  maghrib?: string;
  isha?: string;
  jummah?: string;
}

// ─── Argument Parsing ────────────────────────────────────────────────────────

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    const value = args[i + 1];
    if (value) parsed[key] = value;
  }

  if (!parsed.city || !parsed.province) {
    console.error("Usage: npx tsx scripts/research-mosques.ts --city <city> --province <province> [--radius <km>]");
    process.exit(1);
  }

  return {
    city: parsed.city,
    province: parsed.province,
    country: parsed.country || "canada",
    radius: parseInt(parsed.radius || "50", 10),
  };
}

// ─── City Coordinates ───────────────────────────────────────────────────────

const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  // Ontario
  toronto: { lat: 43.6532, lon: -79.3832 },
  waterloo: { lat: 43.4643, lon: -80.5204 },
  ottawa: { lat: 45.4215, lon: -75.6972 },
  hamilton: { lat: 43.2557, lon: -79.8711 },
  london: { lat: 42.9849, lon: -81.2453 },
  mississauga: { lat: 43.5890, lon: -79.6441 },
  brampton: { lat: 43.7315, lon: -79.7624 },
  windsor: { lat: 42.3149, lon: -83.0364 },
  kingston: { lat: 44.2312, lon: -76.4860 },
  barrie: { lat: 44.3894, lon: -79.6903 },
  oshawa: { lat: 43.8971, lon: -78.8658 },
  markham: { lat: 43.8561, lon: -79.3370 },
  // Quebec
  montreal: { lat: 45.5017, lon: -73.5673 },
  // Alberta
  calgary: { lat: 51.0447, lon: -114.0719 },
  edmonton: { lat: 53.5461, lon: -113.4938 },
  // BC
  vancouver: { lat: 49.2827, lon: -123.1207 },
  // Manitoba
  winnipeg: { lat: 49.8951, lon: -97.1384 },
  // Saskatchewan
  saskatoon: { lat: 52.1332, lon: -106.6700 },
  // Nova Scotia
  halifax: { lat: 44.6488, lon: -63.5752 },
};

// ─── Source 1: OpenStreetMap Overpass API (FREE) ─────────────────────────────

async function searchOverpassAPI(lat: number, lon: number, radiusKm: number): Promise<RawMosque[]> {
  const radiusM = radiusKm * 1000;
  const query = `
    [out:json][timeout:60];
    (
      node["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusM},${lat},${lon});
      way["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusM},${lat},${lon});
      relation["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusM},${lat},${lon});
    );
    out center body;
  `;

  console.log(`  [Overpass API] Searching within ${radiusKm}km of ${lat},${lon}...`);

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      console.error(`  [Overpass API] HTTP ${response.status}: ${response.statusText}`);
      return [];
    }

    const data = await response.json() as {
      elements: Array<{
        tags?: Record<string, string>;
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
      }>;
    };

    const mosques: RawMosque[] = [];
    for (const el of data.elements) {
      const tags = el.tags || {};
      const elLat = el.lat || el.center?.lat;
      const elLon = el.lon || el.center?.lon;

      if (!elLat || !elLon) continue;

      const name = tags.name || tags["name:en"] || "Unknown Mosque";
      const isMusalla =
        name.toLowerCase().includes("musalla") ||
        name.toLowerCase().includes("prayer room") ||
        name.toLowerCase().includes("prayer space");

      mosques.push({
        name,
        type: isMusalla ? "musalla" : "mosque",
        address: [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"], tags["addr:province"]]
          .filter(Boolean)
          .join(", ") || "",
        city: tags["addr:city"] || "",
        latitude: elLat,
        longitude: elLon,
        phone: tags.phone || tags["contact:phone"],
        website: tags.website || tags["contact:website"],
        source: "openstreetmap",
        notes: tags.description || undefined,
      });
    }

    console.log(`  [Overpass API] Found ${mosques.length} results`);
    return mosques;
  } catch (error) {
    console.error("  [Overpass API] Error:", error);
    return [];
  }
}

// ─── Source 2: MAWAQIT API — iqama time enrichment ──────────────────────────

const MAWAQIT_BASE = "https://mawaqit.net/en/api/2.0";

async function searchMawaqitNearby(lat: number, lon: number, radiusM: number = 5000): Promise<MawaqitMosque[]> {
  try {
    const url = `${MAWAQIT_BASE}/mosque/search?lat=${lat}&lon=${lon}&radius=${radiusM}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.warn(`  [MAWAQIT] Search returned HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : (data.mosques ?? []);
  } catch {
    return [];
  }
}

async function fetchMawaqitById(uuid: string): Promise<MawaqitMosque | null> {
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

function findMawaqitMatch(
  candidates: MawaqitMosque[],
  mosque: RawMosque
): MawaqitMosque | null {
  let best: MawaqitMosque | null = null;
  let bestScore = -1;

  for (const c of candidates) {
    const dist = haversine(mosque.latitude, mosque.longitude, c.latitude, c.longitude);
    if (dist > 0.3) continue; // >300m — unlikely same mosque

    const sim = nameSimilarity(mosque.name.toLowerCase(), c.name.toLowerCase());
    if (sim < 0.4) continue;

    const proxScore = Math.max(0, 1 - dist / 0.3);
    const score = 0.6 * sim + 0.4 * proxScore;

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function extractIqamaFromMawaqit(mosque: MawaqitMosque): IqamaTimes {
  const month = String(new Date().getMonth() + 1);

  if (mosque.iqamaCalendar) {
    const entry = mosque.iqamaCalendar[month] || mosque.iqamaCalendar["1"];
    if (entry && entry.length >= 5) {
      const prayers: (keyof IqamaTimes)[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
      const result: IqamaTimes = {};
      for (let i = 0; i < prayers.length; i++) {
        const t = entry[i];
        if (t && /^\d{1,2}:\d{2}/.test(t)) {
          result[prayers[i]] = normalizeTime(t);
        }
      }
      if (Object.keys(result).length > 0) return result;
    }
  }

  if (mosque.iqama && mosque.times) {
    const adhanIdx = [0, 2, 3, 4, 5]; // times[]: fajr,shuruk,dhuhr,asr,maghrib,isha
    const prayers: (keyof IqamaTimes)[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
    const result: IqamaTimes = {};
    for (let i = 0; i < prayers.length; i++) {
      const offset = mosque.iqama[i];
      const adhan = mosque.times[adhanIdx[i]];
      if (offset != null && adhan && /^\d{1,2}:\d{2}/.test(adhan)) {
        result[prayers[i]] = addMinutes(adhan, offset);
      }
    }
    if (Object.keys(result).length > 0) return result;
  }

  return {};
}

// ─── Deduplication ──────────────────────────────────────────────────────────

function deduplicateMosques(mosques: RawMosque[]): RawMosque[] {
  const unique: RawMosque[] = [];

  for (const mosque of mosques) {
    const isDuplicate = unique.some((existing) => {
      const nameSim = nameSimilarity(existing.name.toLowerCase(), mosque.name.toLowerCase());
      const dist = haversine(existing.latitude, existing.longitude, mosque.latitude, mosque.longitude);
      return (nameSim > 0.7 && dist < 0.2) || dist < 0.05;
    });

    if (!isDuplicate) {
      unique.push(mosque);
    }
  }

  return unique;
}

function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return intersection / Math.max(wordsA.size, wordsB.size);
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

// ─── Output ─────────────────────────────────────────────────────────────────

interface EnrichedMosque extends RawMosque {
  mawaqitId?: string;
  iqamaTimes?: IqamaTimes;
}

function generateSeedFile(
  args: Args,
  coords: { lat: number; lon: number },
  mosques: EnrichedMosque[]
): string {
  const provinceSlug = args.province.toLowerCase().replace(/\s+/g, "-");
  const citySlug = args.city.toLowerCase().replace(/\s+/g, "-");
  const outDir = path.join(__dirname, "..", "data", "mosques", args.country, provinceSlug);
  const outFile = path.join(outDir, `${citySlug}.json`);

  fs.mkdirSync(outDir, { recursive: true });

  const seedData = {
    region: citySlug,
    province: args.province,
    country: args.country,
    centerLat: coords.lat,
    centerLon: coords.lon,
    radiusKm: args.radius,
    lastResearched: new Date().toISOString().split("T")[0],
    researchedBy: "overpass-api-scraper+mawaqit",
    mosques: mosques.map((m) => ({
      name: m.name,
      type: m.type,
      address: m.address || "Address unknown — needs verification",
      city: m.city || args.city,
      province: args.province,
      country: "Canada",
      latitude: m.latitude,
      longitude: m.longitude,
      phone: m.phone || null,
      website: m.website || null,
      googleRating: m.googleRating || null,
      googleReviewCount: m.googleReviewCount || null,
      hasLiveStream: false,
      verified: false,
      mawaqitId: m.mawaqitId || null,
      iqamaTimes: m.iqamaTimes && Object.keys(m.iqamaTimes).length > 0
        ? m.iqamaTimes
        : null,
      sources: m.mawaqitId
        ? [...new Set([m.source, "mawaqit.net"])]
        : [m.source],
      notes: m.notes || null,
    })),
  };

  fs.writeFileSync(outFile, JSON.stringify(seedData, null, 2));
  return outFile;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const cityKey = args.city.toLowerCase().replace(/\s+/g, "-");
  const coords = CITY_COORDS[cityKey];

  if (!coords) {
    console.error(`Unknown city: ${args.city}. Add coordinates to CITY_COORDS in this script.`);
    console.error("Available cities:", Object.keys(CITY_COORDS).join(", "));
    process.exit(1);
  }

  console.log(`\n=== Researching mosques in ${args.city}, ${args.province} ===`);
  console.log(`  Center: ${coords.lat}, ${coords.lon}`);
  console.log(`  Radius: ${args.radius}km\n`);

  // Source 1: Overpass API (OpenStreetMap)
  const osmResults = await searchOverpassAPI(coords.lat, coords.lon, args.radius);
  const unique = deduplicateMosques(osmResults);

  console.log(`\n  Total raw results: ${osmResults.length}`);
  console.log(`  After deduplication: ${unique.length}`);

  // Source 2: MAWAQIT — search once for the whole city area, then match per mosque
  console.log(`\n  [MAWAQIT] Searching for mosques near city center...`);
  const mawaqitResults = await searchMawaqitNearby(
    coords.lat,
    coords.lon,
    args.radius * 1000
  );
  console.log(`  [MAWAQIT] Found ${mawaqitResults.length} entries`);

  // Enrich each mosque with MAWAQIT data
  let mawaqitMatched = 0;
  const enriched: EnrichedMosque[] = await Promise.all(
    unique.map(async (mosque) => {
      const match = findMawaqitMatch(mawaqitResults, mosque);
      if (!match) return mosque;

      // Fetch full details for better iqamaCalendar data
      const full = await fetchMawaqitById(match.uuid);
      const iqamaTimes = extractIqamaFromMawaqit(full ?? match);

      if (Object.keys(iqamaTimes).length > 0) {
        mawaqitMatched++;
        return {
          ...mosque,
          mawaqitId: match.uuid,
          iqamaTimes,
          // Prefer MAWAQIT's phone/website if we don't have them
          phone: mosque.phone || undefined,
          website: mosque.website || undefined,
        };
      }

      return { ...mosque, mawaqitId: match.uuid };
    })
  );

  // Generate seed file
  const outFile = generateSeedFile(args, coords, enriched);

  console.log(`\n  Output: ${outFile}`);
  console.log(`  Mosques/musallas found: ${unique.length}`);
  console.log(`  Matched on MAWAQIT: ${mawaqitResults.length > 0 ? `${mawaqitMatched}/${unique.length}` : "skipped (MAWAQIT unreachable)"}`);
  console.log(`  Iqama times pre-filled: ${mawaqitMatched}`);
  console.log(`\n  Next steps:`);
  console.log(`  1. Review the file and verify mosque data`);
  console.log(`  2. Add Google ratings from Google Maps`);
  console.log(`  3. Manually fill iqama times for mosques not on MAWAQIT`);
  console.log(`  4. Commit the file to the repo`);
  console.log(`  5. Deploy → seed script will load it into the database\n`);

  // Summary
  const mosqueCount = unique.filter(m => m.type === "mosque").length;
  const musallaCount = unique.filter(m => m.type === "musalla").length;
  console.log(`  Breakdown: ${mosqueCount} mosques, ${musallaCount} musallas`);
}

main().catch(console.error);
