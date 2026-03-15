/**
 * Iqama enrichment CLI — finds iqama times for mosques in a seed JSON file
 * and writes them back. Run this before committing new city data.
 *
 * Usage:
 *   npx tsx scripts/enrich-iqama.ts --city "Waterloo" --province "Ontario"
 *   npx tsx scripts/enrich-iqama.ts --city "Toronto"  --province "Ontario" --force
 *   npx tsx scripts/enrich-iqama.ts --all-cities
 *
 * After running, review the diff and commit:
 *   git diff data/mosques/
 *   git add data/mosques/ && git commit -m "feat(data): enrich iqama for Waterloo"
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SeedMosque {
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  website?: string | null;
  mawaqitId?: string | null;
  iqamaTimes?: IqamaTimes | null;
  sources?: string[];
  [key: string]: unknown;
}

interface SeedFile {
  region: string;
  province: string;
  mosques: SeedMosque[];
  [key: string]: unknown;
}

type IqamaTimes = Partial<Record<"fajr" | "dhuhr" | "asr" | "maghrib" | "isha", string>>;

interface MawaqitMosque {
  uuid: string;
  name: string;
  latitude: number;
  longitude: number;
  iqamaCalendar?: Record<string, (string | null)[]>;
  times?: string[];
  iqama?: (number | null)[];
}

// ─── Args ─────────────────────────────────────────────────────────────────────

interface Args {
  city?: string;
  province?: string;
  allCities: boolean;
  force: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      parsed[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    }
  }
  return {
    city: parsed.city,
    province: parsed.province,
    allCities: parsed["all-cities"] === "true",
    force: parsed.force === "true",
  };
}

// ─── Seed file discovery ──────────────────────────────────────────────────────

const DATA_ROOT = path.join(__dirname, "..", "data", "mosques");

function findSeedFile(city: string, province: string): string | null {
  const provinceSlug = province.toLowerCase().replace(/\s+/g, "-");
  const citySlug = city.toLowerCase().replace(/\s+/g, "-");
  const filePath = path.join(DATA_ROOT, "canada", provinceSlug, `${citySlug}.json`);
  return fs.existsSync(filePath) ? filePath : null;
}

function findAllSeedFiles(): string[] {
  const files: string[] = [];
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".json")) files.push(full);
    }
  }
  walk(DATA_ROOT);
  return files;
}

// ─── MAWAQIT API ──────────────────────────────────────────────────────────────

const MAWAQIT_BASE = "https://mawaqit.net/en/api/2.0";

async function mawaqitSearch(lat: number, lon: number, radiusM: number): Promise<MawaqitMosque[]> {
  try {
    const res = await fetch(`${MAWAQIT_BASE}/mosque/search?lat=${lat}&lon=${lon}&radius=${radiusM}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.mosques ?? []);
  } catch {
    return [];
  }
}

async function mawaqitFetch(uuid: string): Promise<MawaqitMosque | null> {
  try {
    const res = await fetch(`${MAWAQIT_BASE}/mosque/${uuid}`, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function bestMatch(candidates: MawaqitMosque[], name: string, lat: number, lon: number): MawaqitMosque | null {
  let best: MawaqitMosque | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    const dist = haversineKm(lat, lon, c.latitude, c.longitude);
    if (dist > 0.3) continue;
    const sim = jaccard(name.toLowerCase(), c.name.toLowerCase());
    if (sim < 0.4) continue;
    const score = 0.6 * sim + 0.4 * Math.max(0, 1 - dist / 0.3);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function extractIqama(mosque: MawaqitMosque): IqamaTimes {
  const month = String(new Date().getMonth() + 1);
  const keys = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;

  if (mosque.iqamaCalendar) {
    const entry = mosque.iqamaCalendar[month] ?? mosque.iqamaCalendar["1"];
    if (entry && entry.length >= 5) {
      const result: IqamaTimes = {};
      for (let i = 0; i < keys.length; i++) {
        const t = entry[i];
        if (t && /^\d{1,2}:\d{2}/.test(t)) result[keys[i]] = normTime(t);
      }
      if (Object.keys(result).length > 0) return result;
    }
  }

  if (mosque.iqama && mosque.times) {
    const adhanIdx = [0, 2, 3, 4, 5];
    const result: IqamaTimes = {};
    for (let i = 0; i < keys.length; i++) {
      const offset = mosque.iqama[i];
      const adhan = mosque.times[adhanIdx[i]];
      if (offset != null && adhan && /^\d{1,2}:\d{2}/.test(adhan)) {
        result[keys[i]] = addMins(adhan, offset);
      }
    }
    if (Object.keys(result).length > 0) return result;
  }

  return {};
}

// ─── Website scraping ─────────────────────────────────────────────────────────

async function scrapeWebsite(url: string): Promise<IqamaTimes> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "LiveAzan/1.0 (mosque schedule lookup)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return {};
    const html = await res.text();
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    return parseIqama(text);
  } catch {
    return {};
  }
}

function parseIqama(text: string): IqamaTimes {
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
    if (m) result[prayer] = normTime(m[1] + (m[2] ? ` ${m[2]}` : ""));
  }
  return result;
}

// ─── Enrichment ───────────────────────────────────────────────────────────────

async function enrichSeedFile(filePath: string, force: boolean): Promise<void> {
  const raw = fs.readFileSync(filePath, "utf-8");
  const seed: SeedFile = JSON.parse(raw);

  const needsEnrichment = seed.mosques.filter(
    (m) => force || !m.iqamaTimes || Object.keys(m.iqamaTimes).length === 0
  );

  if (needsEnrichment.length === 0) {
    console.log(`  [${seed.region}] All mosques already have iqama times. Use --force to re-fetch.`);
    return;
  }

  console.log(`\n  [${seed.region}] ${needsEnrichment.length}/${seed.mosques.length} mosques need enrichment`);

  // Bulk MAWAQIT search for the whole city area using first mosque's coords
  const centerMosque = seed.mosques[0];
  let cityMawaqitCache: MawaqitMosque[] = [];
  if (centerMosque) {
    process.stdout.write("  [MAWAQIT] Fetching city area... ");
    cityMawaqitCache = await mawaqitSearch(centerMosque.latitude, centerMosque.longitude, 30_000);
    console.log(`${cityMawaqitCache.length} found`);
  }

  let mawaqitCount = 0;
  let websiteCount = 0;
  let missingNames: string[] = [];

  for (const mosque of needsEnrichment) {
    let found = false;

    // Try MAWAQIT
    if (mosque.mawaqitId) {
      const full = await mawaqitFetch(mosque.mawaqitId);
      if (full) {
        const times = extractIqama(full);
        if (Object.keys(times).length > 0) {
          mosque.iqamaTimes = times;
          addSource(mosque, "mawaqit.net");
          mawaqitCount++;
          found = true;
        }
      }
    }

    if (!found) {
      const match = bestMatch(cityMawaqitCache, mosque.name, mosque.latitude, mosque.longitude);
      if (match) {
        const full = await mawaqitFetch(match.uuid);
        const times = extractIqama(full ?? match);
        if (Object.keys(times).length > 0) {
          mosque.iqamaTimes = times;
          mosque.mawaqitId = match.uuid;
          addSource(mosque, "mawaqit.net");
          mawaqitCount++;
          found = true;
        }
      }
    }

    // Try website scrape
    if (!found && mosque.website) {
      const times = await scrapeWebsite(mosque.website);
      if (Object.keys(times).length > 0) {
        mosque.iqamaTimes = times;
        addSource(mosque, "website");
        websiteCount++;
        found = true;
      }
    }

    if (!found) {
      missingNames.push(mosque.name);
    }

    await sleep(200);
  }

  // Write updated seed back to file
  fs.writeFileSync(filePath, JSON.stringify(seed, null, 2));

  // Report
  console.log(`  Results for ${seed.region}:`);
  console.log(`    Via MAWAQIT:   ${mawaqitCount}`);
  console.log(`    Via website:   ${websiteCount}`);
  if (missingNames.length > 0) {
    console.log(`    Still missing: ${missingNames.length}`);
    for (const n of missingNames) console.log(`      - ${n}`);
  } else {
    console.log(`    Still missing: 0 — full coverage!`);
  }
}

function addSource(mosque: SeedMosque, source: string): void {
  if (!mosque.sources) mosque.sources = [];
  if (!mosque.sources.includes(source)) mosque.sources.push(source);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!args.allCities && (!args.city || !args.province)) {
    console.error("Usage:");
    console.error("  npx tsx scripts/enrich-iqama.ts --city \"Waterloo\" --province \"Ontario\"");
    console.error("  npx tsx scripts/enrich-iqama.ts --all-cities");
    process.exit(1);
  }

  console.log("=== LiveAzan Iqama Enrichment ===");
  if (args.force) console.log("(force mode — re-fetching all)");

  if (args.allCities) {
    const files = findAllSeedFiles();
    console.log(`Found ${files.length} seed files\n`);
    for (const file of files) {
      await enrichSeedFile(file, args.force);
    }
  } else {
    const file = findSeedFile(args.city!, args.province!);
    if (!file) {
      console.error(`No seed file found for ${args.city}, ${args.province}`);
      console.error(`Expected: data/mosques/canada/${args.province!.toLowerCase().replace(/\s+/g, "-")}/${args.city!.toLowerCase().replace(/\s+/g, "-")}.json`);
      console.error("Run research-mosques.ts first to create the seed file.");
      process.exit(1);
    }
    await enrichSeedFile(file, args.force);
  }

  console.log("\nDone. Review changes with: git diff data/mosques/");
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function jaccard(a: string, b: string): number {
  const wa = new Set(a.split(/\s+/).filter((w) => w.length > 2));
  const wb = new Set(b.split(/\s+/).filter((w) => w.length > 2));
  if (wa.size === 0 && wb.size === 0) return 1;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.max(wa.size, wb.size);
}

function normTime(t: string): string {
  t = t.trim();
  const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const period = m12[3].toLowerCase();
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${m12[2]}`;
  }
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return `${String(parseInt(m24[1], 10)).padStart(2, "0")}:${m24[2]}`;
  return t;
}

function addMins(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch(console.error);
