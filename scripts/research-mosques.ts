/**
 * DEV-ONLY: AI-assisted mosque research tool.
 *
 * This script is used by admins in the dev environment to research mosques
 * for a new city/region. It is NOT part of the production app.
 *
 * Usage:
 *   npx tsx scripts/research-mosques.ts --city "Winnipeg" --province "Manitoba" --radius 300
 *
 * What it does:
 * 1. Queries Google Places API for mosques in the area
 * 2. Queries OpenStreetMap Overpass API for Islamic worship places
 * 3. Cross-references with masjidbox.com and prayersconnect.com
 * 4. Deduplicates results by name similarity + distance
 * 5. Outputs a JSON seed file to data/mosques/
 *
 * The admin then reviews, verifies, and commits the file to the repo.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Argument Parsing ────────────────────────────────────────────────────────

interface Args {
  city: string;
  province: string;
  country: string;
  radius: number;
}

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
    console.error("Example: npx tsx scripts/research-mosques.ts --city Winnipeg --province Manitoba --radius 300");
    process.exit(1);
  }

  return {
    city: parsed.city,
    province: parsed.province,
    country: parsed.country || "canada",
    radius: parseInt(parsed.radius || "300", 10),
  };
}

// ─── City Coordinates Lookup ─────────────────────────────────────────────────

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
  // Quebec
  montreal: { lat: 45.5017, lon: -73.5673 },
  "quebec-city": { lat: 46.8139, lon: -71.2080 },
  // Alberta
  calgary: { lat: 51.0447, lon: -114.0719 },
  edmonton: { lat: 53.5461, lon: -113.4938 },
  // BC
  vancouver: { lat: 49.2827, lon: -123.1207 },
  surrey: { lat: 49.1913, lon: -122.8490 },
  // Manitoba
  winnipeg: { lat: 49.8951, lon: -97.1384 },
  // Saskatchewan
  saskatoon: { lat: 52.1332, lon: -106.6700 },
  regina: { lat: 50.4452, lon: -104.6189 },
  // Nova Scotia
  halifax: { lat: 44.6488, lon: -63.5752 },
};

// ─── Data Sources (TODO: Implement actual API calls) ─────────────────────────

interface RawMosque {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
  website?: string;
  source: string;
}

async function searchGooglePlaces(lat: number, lon: number, radiusKm: number): Promise<RawMosque[]> {
  // TODO: Implement Google Places API search
  // GET https://maps.googleapis.com/maps/api/place/nearbysearch/json
  //   ?location={lat},{lon}
  //   &radius={radiusKm * 1000}
  //   &type=mosque
  //   &key={GOOGLE_API_KEY}
  //
  // Requires GOOGLE_PLACES_API_KEY environment variable
  // Cost: ~$17 per 1000 requests
  console.log(`  [TODO] Google Places API: mosque near ${lat},${lon} radius ${radiusKm}km`);
  return [];
}

async function searchOverpassAPI(lat: number, lon: number, radiusKm: number): Promise<RawMosque[]> {
  // TODO: Implement Overpass API (OpenStreetMap) search
  // POST https://overpass-api.de/api/interpreter
  // Query: [out:json];
  //   node["amenity"="place_of_worship"]["religion"="muslim"]
  //   (around:{radiusKm * 1000},{lat},{lon});
  //   out body;
  //
  // Free, no API key needed
  console.log(`  [TODO] Overpass API: Islamic worship places near ${lat},${lon}`);
  return [];
}

async function searchMasjidbox(city: string): Promise<RawMosque[]> {
  // TODO: Scrape masjidbox.com for mosques in this city
  // URL: https://masjidbox.com/search?q={city}
  // Parse HTML for mosque listings
  console.log(`  [TODO] Masjidbox: search for mosques in ${city}`);
  return [];
}

async function searchMAWAQIT(lat: number, lon: number): Promise<RawMosque[]> {
  // TODO: Use MAWAQIT API/SDK for mosque data
  // pip install mawaqit (Python SDK)
  // Or API: https://mawaqit.net/api
  console.log(`  [TODO] MAWAQIT: search near ${lat},${lon}`);
  return [];
}

// ─── Deduplication ───────────────────────────────────────────────────────────

function deduplicateMosques(mosques: RawMosque[]): RawMosque[] {
  const unique: RawMosque[] = [];

  for (const mosque of mosques) {
    const isDuplicate = unique.some((existing) => {
      const nameSimilarity = similarity(existing.name.toLowerCase(), mosque.name.toLowerCase());
      const distance = haversine(existing.latitude, existing.longitude, mosque.latitude, mosque.longitude);
      return nameSimilarity > 0.8 && distance < 0.1; // 80% similar name AND within 100m
    });

    if (!isDuplicate) {
      unique.push(mosque);
    }
  }

  return unique;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;

  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longer.length;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Output ──────────────────────────────────────────────────────────────────

function generateSeedFile(args: Args, coords: { lat: number; lon: number }, mosques: RawMosque[]): void {
  const provinceSlug = args.province.toLowerCase().replace(/\s+/g, "-");
  const citySlug = args.city.toLowerCase().replace(/\s+/g, "-");
  const outDir = path.join(__dirname, "..", "data", "mosques", args.country, provinceSlug);
  const outFile = path.join(outDir, `${citySlug}.json`);

  fs.mkdirSync(outDir, { recursive: true });

  const seedData = {
    region: citySlug,
    province: args.province.toLowerCase(),
    country: args.country,
    centerLat: coords.lat,
    centerLon: coords.lon,
    radiusKm: args.radius,
    lastResearched: new Date().toISOString().split("T")[0],
    researchedBy: "admin",
    mosques: mosques.map((m) => ({
      name: m.name,
      address: m.address,
      city: args.city,
      province: args.province,
      latitude: m.latitude,
      longitude: m.longitude,
      phone: m.phone || null,
      website: m.website || null,
      sources: [m.source],
      iqama: null, // Admin must fill in manually or from masjidbox/prayersconnect
    })),
  };

  fs.writeFileSync(outFile, JSON.stringify(seedData, null, 2));
  console.log(`\n  Output: ${outFile}`);
  console.log(`  Mosques found: ${mosques.length}`);
  console.log(`\n  Next steps:`);
  console.log(`  1. Review the file and verify mosque data`);
  console.log(`  2. Fill in iqama times from masjidbox/prayersconnect`);
  console.log(`  3. Commit the file to the repo`);
  console.log(`  4. Deploy → seed script will load it into the database`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const cityKey = args.city.toLowerCase().replace(/\s+/g, "-");
  const coords = CITY_COORDS[cityKey];

  if (!coords) {
    console.error(`Unknown city: ${args.city}. Add coordinates to CITY_COORDS in this script.`);
    process.exit(1);
  }

  console.log(`\nResearching mosques in ${args.city}, ${args.province}`);
  console.log(`  Center: ${coords.lat}, ${coords.lon}`);
  console.log(`  Radius: ${args.radius}km\n`);

  // Gather from all sources
  const allMosques: RawMosque[] = [];

  const googleResults = await searchGooglePlaces(coords.lat, coords.lon, args.radius);
  allMosques.push(...googleResults);

  const osmResults = await searchOverpassAPI(coords.lat, coords.lon, args.radius);
  allMosques.push(...osmResults);

  const masjidboxResults = await searchMasjidbox(args.city);
  allMosques.push(...masjidboxResults);

  const mawaqitResults = await searchMAWAQIT(coords.lat, coords.lon);
  allMosques.push(...mawaqitResults);

  // Deduplicate
  const unique = deduplicateMosques(allMosques);
  console.log(`\n  Total raw results: ${allMosques.length}`);
  console.log(`  After deduplication: ${unique.length}`);

  // Generate seed file
  generateSeedFile(args, coords, unique);

  if (unique.length === 0) {
    console.log("\n  NOTE: No mosques found — API integrations are TODO.");
    console.log("  For now, manually create the seed file using data from:");
    console.log("    - masjidbox.com");
    console.log("    - prayersconnect.com");
    console.log("    - Google Maps search");
    console.log("    - mawaqit.net");
  }
}

main().catch(console.error);
