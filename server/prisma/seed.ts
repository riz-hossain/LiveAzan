/**
 * Database Seed Script
 *
 * Reads all JSON files from data/mosques/**\/*.json and upserts each mosque
 * into PostgreSQL via Prisma. Creates RegionScan records for each file.
 * Idempotent — safe to run multiple times.
 *
 * Usage: npx tsx prisma/seed.ts
 */

import { PrismaClient, Prayer } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// ---------- Types matching the seed JSON format ----------

interface MosqueSeedEntry {
  name: string;
  address: string;
  city: string;
  province: string;
  country: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
  hasLiveStream: boolean;
  verified: boolean;
  iqamaTimes: {
    fajr: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
    jummah: string;
  };
  sources: string[];
}

interface MosqueSeedFile {
  region: string;
  province: string;
  country: string;
  centerLat: number;
  centerLon: number;
  radiusKm: number;
  lastResearched: string;
  researchedBy: string;
  mosques: MosqueSeedEntry[];
}

// ---------- Helpers ----------

/** Recursively find all .json files under a directory, excluding _meta */
function findJsonFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_meta") continue;
      results.push(...findJsonFiles(fullPath));
    } else if (entry.name.endsWith(".json")) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Simple geohash-like key for a region (good enough for seed dedup) */
function regionKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

/** Map prayer name string to the Prayer enum */
function toPrayerEnum(name: string): Prayer {
  const map: Record<string, Prayer> = {
    fajr: Prayer.FAJR,
    dhuhr: Prayer.DHUHR,
    asr: Prayer.ASR,
    maghrib: Prayer.MAGHRIB,
    isha: Prayer.ISHA,
    jummah: Prayer.JUMMAH,
  };
  const result = map[name.toLowerCase()];
  if (!result) throw new Error(`Unknown prayer: ${name}`);
  return result;
}

// ---------- Main ----------

async function main() {
  const dataDir = path.resolve(__dirname, "../../data/mosques");
  const files = findJsonFiles(dataDir);

  if (files.length === 0) {
    console.log("No seed files found in", dataDir);
    return;
  }

  console.log(`Found ${files.length} seed file(s). Seeding...`);

  let totalMosques = 0;

  for (const filePath of files) {
    const relativePath = path.relative(dataDir, filePath);
    const raw = fs.readFileSync(filePath, "utf-8");
    let data: MosqueSeedFile;

    try {
      data = JSON.parse(raw) as MosqueSeedFile;
    } catch (err) {
      console.error(`  Skipping ${relativePath}: invalid JSON`);
      continue;
    }

    console.log(
      `  Processing ${relativePath} (${data.mosques.length} mosques)...`
    );

    // Upsert RegionScan
    const geohash = regionKey(data.centerLat, data.centerLon);
    await prisma.regionScan.upsert({
      where: { geohash },
      create: {
        geohash,
        centerLat: data.centerLat,
        centerLon: data.centerLon,
        radiusKm: data.radiusKm,
        scanStatus: "COMPLETED",
        mosquesFound: data.mosques.length,
        lastScannedAt: new Date(data.lastResearched),
        seedFile: relativePath,
      },
      update: {
        mosquesFound: data.mosques.length,
        lastScannedAt: new Date(data.lastResearched),
        scanStatus: "COMPLETED",
        seedFile: relativePath,
      },
    });

    // Upsert each mosque
    for (const m of data.mosques) {
      // Use name + city as a composite unique key for upsert.
      // Prisma requires a @@unique for upsert, so we use a raw findFirst + create/update.
      const existing = await prisma.mosque.findFirst({
        where: { name: m.name, city: m.city },
      });

      let mosqueId: string;

      if (existing) {
        await prisma.mosque.update({
          where: { id: existing.id },
          data: {
            address: m.address,
            province: m.province,
            country: m.country,
            latitude: m.latitude,
            longitude: m.longitude,
            phone: m.phone,
            website: m.website,
            hasLiveStream: m.hasLiveStream,
            verified: m.verified,
          },
        });
        mosqueId = existing.id;
      } else {
        const created = await prisma.mosque.create({
          data: {
            name: m.name,
            address: m.address,
            city: m.city,
            province: m.province,
            country: m.country,
            latitude: m.latitude,
            longitude: m.longitude,
            phone: m.phone,
            website: m.website,
            hasLiveStream: m.hasLiveStream,
            verified: m.verified,
          },
        });
        mosqueId = created.id;
      }

      // Upsert iqama schedules (one per prayer, effective from seed date)
      const effectiveFrom = new Date(data.lastResearched);
      const prayers = Object.entries(m.iqamaTimes) as [string, string][];

      for (const [prayerName, timeValue] of prayers) {
        const prayer = toPrayerEnum(prayerName);

        // Check for existing schedule for this mosque + prayer + effective date
        const existingSchedule = await prisma.iqamaSchedule.findFirst({
          where: {
            mosqueId,
            prayer,
            effectiveFrom,
          },
        });

        if (existingSchedule) {
          await prisma.iqamaSchedule.update({
            where: { id: existingSchedule.id },
            data: { iqamaTime: timeValue },
          });
        } else {
          await prisma.iqamaSchedule.create({
            data: {
              mosqueId,
              prayer,
              iqamaTime: timeValue,
              effectiveFrom,
            },
          });
        }
      }

      totalMosques++;
    }
  }

  console.log(
    `\nSeeded ${totalMosques} mosques from ${files.length} file(s).`
  );
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
