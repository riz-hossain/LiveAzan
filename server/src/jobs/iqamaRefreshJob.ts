/**
 * Monthly iqama refresh cron job.
 *
 * Runs on the 1st of every month at 2:00 AM server time.
 * Finds all cities where at least one user has a primary mosque,
 * then re-fetches iqama times for stale mosques in those cities.
 *
 * Result is logged to the IqamaRefreshLog table.
 */

import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { enrichCity, getActiveCities, type EnrichmentReport } from "../services/iqamaEnrichment";

// ─── Run logic ────────────────────────────────────────────────────────────────

export async function runIqamaRefreshJob(triggeredBy: "cron" | "admin" = "cron"): Promise<{
  citiesProcessed: number;
  mosquesRefreshed: number;
  mosquesStillMissing: number;
  reports: EnrichmentReport[];
  durationMs: number;
}> {
  const start = Date.now();
  console.log(`[IqamaRefreshJob] Starting (triggered by: ${triggeredBy})`);

  const cities = await getActiveCities();
  console.log(`[IqamaRefreshJob] Active cities: ${cities.length}`);

  const reports: EnrichmentReport[] = [];
  let totalRefreshed = 0;
  let totalMissing = 0;

  for (const { city, province } of cities) {
    console.log(`[IqamaRefreshJob]   Enriching ${city}, ${province}...`);
    try {
      const report = await enrichCity(city, province);
      reports.push(report);
      totalRefreshed += report.enriched;
      totalMissing += report.stillMissing.length;
      console.log(
        `[IqamaRefreshJob]   ${city}: ${report.enriched} enriched, ` +
        `${report.alreadyUpToDate} up-to-date, ${report.stillMissing.length} missing`
      );
    } catch (err) {
      console.error(`[IqamaRefreshJob]   Failed for ${city}:`, err);
    }
  }

  const durationMs = Date.now() - start;

  // Persist log
  await prisma.iqamaRefreshLog.create({
    data: {
      citiesProcessed: cities.length,
      mosquesRefreshed: totalRefreshed,
      mosquesStillMissing: totalMissing,
      durationMs,
      triggeredBy,
    },
  });

  console.log(
    `[IqamaRefreshJob] Done in ${durationMs}ms. ` +
    `Cities: ${cities.length}, Refreshed: ${totalRefreshed}, Still missing: ${totalMissing}`
  );

  return { citiesProcessed: cities.length, mosquesRefreshed: totalRefreshed, mosquesStillMissing: totalMissing, reports, durationMs };
}

// ─── Cron schedule ────────────────────────────────────────────────────────────

/**
 * Start the monthly cron job.
 * Schedule: 2:00 AM on the 1st of every month.
 */
export function startIqamaRefreshJob(): void {
  cron.schedule("0 2 1 * *", () => {
    runIqamaRefreshJob("cron").catch((err) => {
      console.error("[IqamaRefreshJob] Unhandled error:", err);
    });
  });
  console.log("[IqamaRefreshJob] Scheduled: 2:00 AM on the 1st of every month");
}
