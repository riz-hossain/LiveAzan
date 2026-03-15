/**
 * Mosque research tool — scrapes free data sources to find mosques/musallas.
 *
 * Usage:
 *   npx tsx scripts/research-mosques.ts --city "Toronto" --province "Ontario"
 *   npx tsx scripts/research-mosques.ts --city "Ottawa" --province "Ontario" --radius 50
 *
 * Data Sources (all free, no API key required):
 * 1. OpenStreetMap Overpass API — all "amenity=place_of_worship" + "religion=muslim"
 * 2. MuslimLink.ca directory — scraped listing pages
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

// ─── Deduplication ──────────────────────────────────────────────────────────

function deduplicateMosques(mosques: RawMosque[]): RawMosque[] {
  const unique: RawMosque[] = [];

  for (const mosque of mosques) {
    const isDuplicate = unique.some((existing) => {
      const nameSim = nameSimilarity(existing.name.toLowerCase(), mosque.name.toLowerCase());
      const dist = haversine(existing.latitude, existing.longitude, mosque.latitude, mosque.longitude);
      return (nameSim > 0.7 && dist < 0.2) || dist < 0.05; // Similar name + 200m, or within 50m
    });

    if (!isDuplicate) {
      unique.push(mosque);
    }
  }

  return unique;
}

function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  // Simple Jaccard similarity on words
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

// ─── Output ─────────────────────────────────────────────────────────────────

function generateSeedFile(args: Args, coords: { lat: number; lon: number }, mosques: RawMosque[]): string {
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
    researchedBy: "overpass-api-scraper",
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
      iqamaTimes: null,
      sources: [m.source],
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

  // Combine all sources
  const allMosques = [...osmResults];

  // Deduplicate
  const unique = deduplicateMosques(allMosques);

  console.log(`\n  Total raw results: ${allMosques.length}`);
  console.log(`  After deduplication: ${unique.length}`);

  // Generate seed file
  const outFile = generateSeedFile(args, coords, unique);

  console.log(`\n  Output: ${outFile}`);
  console.log(`  Mosques/musallas found: ${unique.length}`);
  console.log(`\n  Next steps:`);
  console.log(`  1. Review the file and verify mosque data`);
  console.log(`  2. Add Google ratings from Google Maps`);
  console.log(`  3. Fill in iqama times from masjidbox/prayersconnect`);
  console.log(`  4. Commit the file to the repo`);
  console.log(`  5. Deploy → seed script will load it into the database\n`);

  // Summary by type
  const mosqueCount = unique.filter(m => m.type === "mosque").length;
  const musallaCount = unique.filter(m => m.type === "musalla").length;
  console.log(`  Breakdown: ${mosqueCount} mosques, ${musallaCount} musallas`);
}

main().catch(console.error);
