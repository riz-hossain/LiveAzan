/**
 * Iqama enrichment service — reads mosques' iqama times from the web and keeps them in
 * the database.
 *
 * The reading is done by the shared reader (packages/shared/src/iqama), the same one
 * the phone app uses: the mosque's own timetable plugin, its web page and its MAWAQIT
 * listing, cross-checked and checked against the sun on the mosque's own day. What it
 * cannot stand behind it does not return, and what it returns with a caveat (a page
 * that names no column, a listing the sun objects to, two sources that disagree) is
 * not stored either: see `usable` in the shared package (iqama/research.ts). The times already stored stay.
 *
 * Used by:
 *  - server/src/jobs/iqamaRefreshJob.ts  (weekly cron)
 *  - server/src/routes/admin.ts          (manual admin trigger)
 */

import { prisma } from "../lib/prisma";
import { fetchText as webFetchText } from "../lib/http";
import { mosqueDay, readMosque, usable, type FetchText } from "@live-azan/shared";
import { planSchedules, type OpenRow, type PrayerName } from "./iqamaPlan";

// ─── Public result types ──────────────────────────────────────────────────────

export interface EnrichmentResult {
  mosqueId: string;
  mosqueName: string;
  source: "mawaqit" | "website" | "plugin" | null;
  prayersFound: string[];
  /** Prayers whose time was new or different, so that a row was written. */
  changed: string[];
  alreadyUpToDate: boolean;
  skipped: boolean;
  /** When nothing was stored, why not, in words for a person. */
  why?: string;
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

/** A refresh is a week apart, so a mosque read within six days is not read again by the job. */
const STALE_DAYS = 6;
const RATE_LIMIT_MS = 250; // pause between mosques
/** Longest one mosque is given: a few requests, the slow ones cut off. */
const READ_BUDGET_MS = 60_000;

// ─── The database, as far as this needs it ────────────────────────────────────

export interface StoredMosque {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  province: string;
  country: string;
  website: string | null;
  mawaqitId: string | null;
  iqamaLastFetched: Date | null;
}

/** What the enrichment reads and writes. The real one is Prisma; tests use a small fake. */
export interface IqamaStore {
  getMosque(id: string): Promise<StoredMosque | null>;
  openSchedules(mosqueId: string): Promise<OpenRow[]>;
  /** Close rows, add rows, and note the source and the time, together or not at all. */
  apply(
    mosqueId: string,
    change: { close: string[]; add: Array<{ prayer: PrayerName; iqamaTime: string }>; on: Date; source: string; at: Date }
  ): Promise<void>;
  /** Note that the mosque was looked at, and nothing came of it. */
  touch(mosqueId: string, at: Date): Promise<void>;
}

const prismaStore: IqamaStore = {
  getMosque: (id) =>
    prisma.mosque.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        province: true,
        country: true,
        website: true,
        mawaqitId: true,
        iqamaLastFetched: true,
      },
    }),

  openSchedules: (mosqueId) =>
    prisma.iqamaSchedule.findMany({
      where: { mosqueId, effectiveTo: null },
      select: { id: true, prayer: true, iqamaTime: true },
    }),

  async apply(mosqueId, change) {
    await prisma.$transaction([
      ...(change.close.length > 0
        ? [prisma.iqamaSchedule.updateMany({ where: { id: { in: change.close } }, data: { effectiveTo: change.on } })]
        : []),
      ...change.add.map((row) =>
        prisma.iqamaSchedule.create({
          data: { mosqueId, prayer: row.prayer, iqamaTime: row.iqamaTime, effectiveFrom: change.on, effectiveTo: null },
        })
      ),
      prisma.mosque.update({ where: { id: mosqueId }, data: { iqamaSource: change.source, iqamaLastFetched: change.at } }),
    ]);
  },

  async touch(mosqueId, at) {
    await prisma.mosque.update({ where: { id: mosqueId }, data: { iqamaLastFetched: at } });
  },
};

export interface Deps {
  store?: IqamaStore;
  fetchText?: FetchText;
  now?: Date;
}

// ─── Main entry points ────────────────────────────────────────────────────────

/**
 * Enrich iqama times for a single mosque in the DB.
 * Skips if iqamaLastFetched is within STALE_DAYS (unless force=true).
 */
export async function enrichMosque(
  mosqueId: string,
  force = false,
  deps: Deps = {}
): Promise<EnrichmentResult> {
  const store = deps.store ?? prismaStore;
  const fetchText = deps.fetchText ?? webFetchText;
  const now = deps.now ?? new Date();

  const mosque = await store.getMosque(mosqueId);
  if (!mosque) {
    return { mosqueId, mosqueName: "unknown", source: null, prayersFound: [], changed: [], alreadyUpToDate: false, skipped: true };
  }
  const base = { mosqueId, mosqueName: mosque.name, source: null, prayersFound: [], changed: [], skipped: false };

  // Skip if recently fetched
  if (!force && mosque.iqamaLastFetched) {
    const age = now.getTime() - mosque.iqamaLastFetched.getTime();
    if (age < STALE_DAYS * 24 * 60 * 60 * 1000) return { ...base, alreadyUpToDate: true };
  }

  // The mosque's own day and clock, not the server's: a server in UTC in the evening is a day ahead of Vancouver.
  const { today, where } = mosqueDay(mosque, now);
  const outcome = await readMosque(
    { name: mosque.name, latitude: mosque.latitude, longitude: mosque.longitude, website: mosque.website, mawaqitId: mosque.mawaqitId },
    { fetchText, today, where, budgetMs: READ_BUDGET_MS, log: (message) => console.log(`[Iqama] ${mosque.name}: ${message}`) }
  );

  const verdict = usable(outcome);
  if (!verdict.ok) {
    // Nothing stored, but looked at: don't ask again straight away.
    await store.touch(mosque.id, now);
    return { ...base, alreadyUpToDate: false, why: verdict.why };
  }

  const plan = planSchedules(verdict.reading, await store.openSchedules(mosque.id));
  await store.apply(mosque.id, {
    close: plan.close,
    add: plan.add,
    on: new Date(Date.UTC(today.year, today.month - 1, today.day)),
    source: verdict.reading.source,
    at: now,
  });

  return {
    ...base,
    source: verdict.reading.source as "mawaqit" | "website" | "plugin",
    prayersFound: plan.found.map((p) => p.toLowerCase()),
    changed: plan.add.map((row) => row.prayer.toLowerCase()),
    alreadyUpToDate: false,
  };
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
