/**
 * Is what was read a timetable a mosque could have?
 *
 * The same questions, whatever the source. A page reading has already passed them
 * (pageReader.ts refuses what fails); a data feed is asked here, because a feed is
 * exact about what it holds and can still hold last winter's schedule or a table
 * nobody filled in. A feed is not refused on these -- a mosque can keep an odd
 * schedule -- but whoever is shown it should be told, and when the mosque's own
 * site says something else, the disagreement decides (pipeline.ts).
 */

import { checkAgainstSun, sunToday } from "./astro";
import { WINDOW } from "./pageReader";
import { PRAYER_KEYS, type MinutesByPrayer, type PrayerKey, type Where, type Ymd } from "./types";
import { parseClock } from "./clock";

export function toMinutes(times: Record<PrayerKey, string>): MinutesByPrayer | null {
  const out = {} as MinutesByPrayer;
  for (const p of PRAYER_KEYS) {
    const m = parseClock(times[p]);
    if (m === null) return null;
    out[p] = m;
  }
  return out;
}

const cap = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/**
 * What is odd about five iqamas, in plain words; an empty list when nothing is.
 *
 * `adhan` is what the source says the calls to prayer are, when it says. `where` lets
 * the sun weigh in: Maghrib cannot fall two hours after sunset, and Fajr cannot come
 * before first light.
 */
export function warningsFor(
  iqama: Record<PrayerKey, string>,
  options: { today: Ymd; where?: Where | null; adhan?: Record<PrayerKey, string> | null }
): string[] {
  const warnings: string[] = [];
  const minutes = toMinutes(iqama);
  if (minutes === null) return ["some of the times could not be read"];

  const run = PRAYER_KEYS.map((p) => minutes[p]);
  if (run.some((m, i) => i > 0 && run[i - 1] >= m)) warnings.push("the five prayers are not in order");
  for (const p of PRAYER_KEYS) {
    const [low, high] = WINDOW[p];
    if (minutes[p] < low || minutes[p] > high) warnings.push(`${cap(p)} at ${iqama[p]} cannot be a ${cap(p)} iqama`);
  }

  if (options.adhan) {
    let equal = 0;
    for (const p of PRAYER_KEYS) {
      const a = parseClock(options.adhan[p]);
      if (a === null) continue;
      const gap = minutes[p] - a;
      if (gap === 0) equal += 1;
      if (gap < 0) warnings.push(`${cap(p)}'s iqama (${iqama[p]}) is before its adhan (${options.adhan[p]})`);
      else if (gap > 90) warnings.push(`${cap(p)}'s iqama (${iqama[p]}) is more than an hour and a half after its adhan`);
    }
    // Maghrib is often called at the same minute; four of five is a table nobody filled in.
    if (equal >= 4) warnings.push("the iqama times are the same as the adhan times, which usually means they were never entered");
  }

  if (options.where) {
    const sun = sunToday(options.where, options.today);
    const objection = checkAgainstSun(minutes, sun);
    if (objection) warnings.push(objection);
  }
  return warnings;
}

const MINUTES: Array<PrayerKey> = [...PRAYER_KEYS];

/**
 * The prayers on which two readings of one day disagree by more than `tolerance`
 * minutes. Only the five daily prayers, by name, and only where both have them.
 */
export function differing(first: Partial<Record<PrayerKey, string>>, second: Partial<Record<PrayerKey, string>>, tolerance = 10): PrayerKey[] {
  return MINUTES.filter((p) => {
    const a = parseClock(first[p]);
    const b = parseClock(second[p]);
    return a !== null && b !== null && Math.abs(a - b) > tolerance;
  });
}
