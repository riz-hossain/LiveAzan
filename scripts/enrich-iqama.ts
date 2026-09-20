/**
 * Iqama enrichment CLI — reads iqama times for the mosques in a seed JSON file and
 * writes them back. Run this before committing new city data.
 *
 * Usage:
 *   npx tsx scripts/enrich-iqama.ts --city "Waterloo" --province "Ontario"
 *   npx tsx scripts/enrich-iqama.ts --city "Toronto"  --province "Ontario" --force
 *   npx tsx scripts/enrich-iqama.ts --all-cities
 *
 * After running, review the diff and commit:
 *   git diff data/mosques/
 *   git add data/mosques/ && git commit -m "feat(data): enrich iqama for Waterloo"
 *
 * The reading is done by the shared reader (packages/shared/src/iqama), the same one the
 * app and the server use: the mosque's own timetable plugin, its web page and its MAWAQIT
 * listing, cross-checked and checked against the sun. What it cannot stand behind it does
 * not write, and neither does it write a page that names no column, a reading that raised
 * a warning, or two sources that disagree: those are listed at the end, with the reason,
 * for a person to look at. A mosque's "sunset+5" Maghrib is kept as the rule it is.
 *
 * Each mosque it writes gets `iqamaAsOf`, the day the times were read, which the bundle
 * and the seed prefer to the file's `lastResearched`.
 */

import * as fs from "fs";
import * as path from "path";
import { mosqueDay, readMosque, updateResearch, type ResearchRecord } from "@live-azan/shared";
import { fetchText } from "../server/src/lib/http";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SeedMosque extends ResearchRecord {
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  website?: string | null;
  mawaqitId?: string | null;
  country?: string;
}

interface SeedFile {
  region: string;
  province: string;
  mosques: SeedMosque[];
  [key: string]: unknown;
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

// LIVEAZAN_DATA_ROOT points it at another copy of the data, to try it out without touching the real one.
const DATA_ROOT = process.env.LIVEAZAN_DATA_ROOT ?? path.join(__dirname, "..", "data", "mosques");

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

  const bySource: Record<string, number> = {};
  const left: Array<{ name: string; why: string }> = [];

  for (const mosque of needsEnrichment) {
    // The mosque's own day and clock: a timetable is for its day, and its sunset is its sunset.
    const { today, where } = mosqueDay({ latitude: mosque.latitude, longitude: mosque.longitude, province: seed.province, country: mosque.country });
    const outcome = await readMosque(
      { name: mosque.name, latitude: mosque.latitude, longitude: mosque.longitude, website: mosque.website ?? null, mawaqitId: mosque.mawaqitId ?? null },
      { fetchText, today, where, budgetMs: 60_000 }
    );

    const update = updateResearch(mosque, outcome, today);
    if (update.wrote.length > 0) {
      Object.assign(mosque, update.record);
      const source = outcome.reading!.source;
      bySource[source] = (bySource[source] ?? 0) + 1;
    } else {
      left.push({ name: mosque.name, why: update.why ?? "nothing could be read" });
    }

    await sleep(200);
  }

  // Write updated seed back to file, only if something changed
  const updated = JSON.stringify(seed, null, 2);
  if (updated !== JSON.stringify(JSON.parse(raw), null, 2)) fs.writeFileSync(filePath, updated);

  // Report
  console.log(`  Results for ${seed.region}:`);
  for (const [source, count] of Object.entries(bySource)) console.log(`    Via ${source}:`.padEnd(18) + count);
  if (left.length > 0) {
    console.log(`    Left alone: ${left.length}`);
    for (const { name, why } of left) console.log(`      - ${name}: ${why}`);
  } else {
    console.log(`    Left alone: 0 — full coverage!`);
  }
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
