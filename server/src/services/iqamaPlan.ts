/**
 * What to do with what the reader found, and how to hand stored times back out.
 *
 * Kept free of the database so it can be tested on its own: the enrichment service
 * (iqamaEnrichment.ts) is the thin layer that reads rows in and writes rows out.
 */

import {
  PRAYER_KEYS,
  hhmm,
  maghribTime,
  mosqueDay,
  parseClock,
  type IqamaReading,
  type PrayerKey,
} from "@live-azan/shared";

/** The database's prayer names, which are also what the app calls them. */
export type PrayerName = "FAJR" | "DHUHR" | "ASR" | "MAGHRIB" | "ISHA" | "JUMMAH";

const NAME_OF: Record<PrayerKey, PrayerName> = {
  fajr: "FAJR",
  dhuhr: "DHUHR",
  asr: "ASR",
  maghrib: "MAGHRIB",
  isha: "ISHA",
};

// ─── What to write ───────────────────────────────────────────────────────────

export interface OpenRow {
  id: string;
  prayer: PrayerName;
  iqamaTime: string;
}

export interface Planned {
  /** Ids of the open rows to close, because the mosque's time has changed. */
  close: string[];
  /** Rows to add, from today. */
  add: Array<{ prayer: PrayerName; iqamaTime: string }>;
  /** Every prayer the reading had, changed or not. */
  found: PrayerName[];
}

/**
 * The changes that bring the open schedule in line with a reading, and no more: a
 * time that is what it was is left alone, so a weekly run adds rows only when a mosque
 * has actually changed its times. (Rows that were added every run, five a mosque, are
 * how the table grew without anything having changed.) A prayer the reading does not
 * have, Jumu'ah most often, is not closed: a page that does not mention it has not
 * cancelled it.
 */
export function planSchedules(reading: Pick<IqamaReading, "times" | "jumuah" | "maghribRule">, open: OpenRow[]): Planned {
  const wanted = new Map<PrayerName, string>();
  for (const key of PRAYER_KEYS) wanted.set(NAME_OF[key], reading.times[key]);
  // A Maghrib the page gave as "sunset + 5" is stored as that rule, as the seed stores it: resolveTimes works it
  // out for the day it is asked about, so it does not go stale, and a weekly run does not rewrite it.
  if (reading.maghribRule) wanted.set("MAGHRIB", reading.maghribRule);
  if (reading.jumuah) wanted.set("JUMMAH", reading.jumuah);

  const plan: Planned = { close: [], add: [], found: [...wanted.keys()] };
  for (const [prayer, iqamaTime] of wanted) {
    const current = open.filter((row) => row.prayer === prayer);
    if (current.length === 1 && current[0].iqamaTime === iqamaTime) continue;
    for (const row of current) plan.close.push(row.id);
    plan.add.push({ prayer, iqamaTime });
  }
  return plan;
}

// ─── What to hand back out ───────────────────────────────────────────────────

const CLOCK = /^\d{1,2}:\d{2}$/;
const SUNSET_RULE = /sunset/i;

/**
 * Stored times as the app can use them: "HH:mm", every one.
 *
 * The research this database was seeded from writes Maghrib as "sunset+5" for most
 * mosques, because that is what they publish and it is right all year where a clock time
 * is right for a week. The app wants a time, so the rule is worked out for today at the
 * mosque, and a row that is neither a time nor such a rule is left out rather than sent
 * as text a countdown cannot read.
 */
export function resolveTimes<T extends { prayer: string; iqamaTime: string }>(
  rows: T[],
  mosque: { latitude: number; longitude: number; province?: string | null; country?: string | null },
  now: Date = new Date()
): T[] {
  const { today, where } = mosqueDay(mosque, now);
  const out: T[] = [];
  for (const row of rows) {
    if (CLOCK.test(row.iqamaTime.trim())) {
      const minutes = parseClock(row.iqamaTime);
      if (minutes !== null) out.push({ ...row, iqamaTime: hhmm(minutes) });
    } else if (row.prayer === "MAGHRIB" && SUNSET_RULE.test(row.iqamaTime)) {
      const worked = maghribTime(row.iqamaTime, where, today);
      if (worked) out.push({ ...row, iqamaTime: worked });
    }
  }
  return out;
}
