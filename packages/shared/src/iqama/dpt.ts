/**
 * Iqama times from a mosque's own website, when it runs the common plugin.
 *
 * A great many mosque sites run the same WordPress plugin -- "Daily Prayer Time
 * for Mosques" -- and it publishes a small JSON API alongside the page people
 * actually read. So nothing has to be scraped: given the address of the mosque's
 * site, ask that API for the year's timetable and read the congregation times
 * straight out of it.
 *
 *     https://example.org/mosque/  ->  .../wp-json/dpt/v1/prayertime?filter=year
 *
 * The plugin calls the congregation time *jamah* (jama'ah) and the call to prayer
 * *begins*; the iqama is the moment people stand, so it is the former. Friday is
 * the exception: the year's timetable has no Jumu'ah in it, because the plugin
 * keeps Jumu'ah as one or more fixed times rather than a per-day row, and those
 * come back only from the "today" call.
 *
 * Two ways a site with the plugin is still no use, both met on real mosques and
 * both worth naming rather than showing nothing: a timetable that stops at last
 * year, and one whose congregation columns were never filled in, so that every
 * "jamah" is simply the start time -- plausible, in order, and an hour early.
 */

import { hhmm, isoDate } from "./clock";
import { hostOf, pathOf } from "./html";
import type { DayTimes, PrayerKey, Ymd } from "./types";

export const DPT_API_PATH = "wp-json/dpt/v1/prayertime";

/** The plugin's field for each prayer's congregation and start time. Zuhr is Dhuhr here. */
const FIELDS: ReadonlyArray<readonly [PrayerKey, string, string]> = [
  ["fajr", "fajr_jamah", "fajr_begins"],
  ["dhuhr", "zuhr_jamah", "zuhr_begins"],
  ["asr", "asr_jamah", "asr_mithl_1"],
  ["maghrib", "maghrib_jamah", "maghrib_begins"],
  ["isha", "isha_jamah", "isha_begins"],
];

export type DptRow = Record<string, unknown> & { d_date?: string };

/**
 * The addresses worth trying, nearest first.
 *
 * A mosque on a multisite lives under a path -- /icwaterloo/ -- and its API hangs off
 * that, not off the domain. Someone pasting the address of the prayer-times *page*
 * should still work, so each parent path is tried in turn.
 *
 * The bare domain is deliberately not one of them once a path is given. On a
 * multisite the domain is a *different* mosque, and a centre whose own timetable is
 * missing would otherwise be handed its neighbour's times with no sign anything was
 * wrong.
 */
export function dptCandidates(siteUrl: string): string[] {
  const url = String(siteUrl ?? "").trim();
  const scheme = /^(https?):\/\//i.exec(url)?.[1];
  const host = hostOf(url);
  if (!scheme || !host) return [];
  const root = `${scheme.toLowerCase()}://${/^[a-z]+:\/\/([^/?#]*)/i.exec(url)![1]}`;
  const segments = pathOf(url).split("/").filter(Boolean);
  if (segments.length === 0) return [root];
  const out: string[] = [];
  while (segments.length) {
    out.push(`${root}/${segments.join("/")}`);
    segments.pop();
  }
  return [...new Set(out)];
}

export const dptApiUrl = (base: string, filter: "year" | "today"): string =>
  `${base.replace(/\/+$/, "")}/${DPT_API_PATH}?filter=${filter}`;

/**
 * Whether an answer came from the site that was asked. On a multisite every mosque is
 * a path under one domain, so a redirect that drops the path lands on somebody else's
 * timetable, and times that are confidently wrong are worse than none.
 */
export function dptSameSite(base: string, finalUrl: string): boolean {
  if (hostOf(base) !== hostOf(finalUrl)) return false;
  const wanted = pathOf(base).replace(/^\/+|\/+$/g, "");
  return !wanted || pathOf(finalUrl).replace(/^\/+|\/+$/g, "").startsWith(wanted);
}

/**
 * The day records, whichever way this filter nested them. "today" answers with a list
 * of one record; "year" with a list holding a list of records.
 */
export function dptRows(payload: unknown): DptRow[] {
  const rows: DptRow[] = [];
  const stack: unknown[] = [payload];
  while (stack.length) {
    const item = stack.shift();
    if (Array.isArray(item)) stack.unshift(...item);
    else if (item && typeof item === "object" && "d_date" in (item as object)) rows.push(item as DptRow);
  }
  return rows;
}

/** Minutes from '06:15:00', '6:15' or '13:30'; null for the plugin's "not set" (00:00). */
function minutesOf(value: unknown): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(value ?? ""));
  if (!m) return null;
  const [hour, minute] = [Number(m[1]), Number(m[2])];
  if (hour > 23 || minute > 59) return null;
  if (hour === 0 && minute === 0) return null;
  return hour * 60 + minute;
}

/**
 * Whether the "congregation" columns are really just the start times.
 *
 * A mosque whose plugin was installed but never given congregation times publishes
 * jamah == begins for every prayer of the year. The values are plausible, in order
 * and wrong -- Fajr's iqama an hour before the mosque's own website says it is -- so
 * no range check can catch them, and a reminder set to fire at "iqama" would call
 * the azan an hour early.
 *
 * Maghrib is often called at the same minute the sun sets, so one match in five is
 * ordinary. Four or more, on nearly every day, is not.
 */
export function dptCongregationUnset(rows: DptRow[]): boolean {
  let days = 0;
  let unset = 0;
  for (const row of rows) {
    days += 1;
    let same = 0;
    for (const [, jamah, begins] of FIELDS) {
      const start = String(row[begins] ?? "").slice(0, 5);
      if (!start) continue;
      const starts = new Set([start]);
      if (begins === "asr_mithl_1") starts.add(String(row.asr_mithl_2 ?? "").slice(0, 5));
      if (starts.has(String(row[jamah] ?? "").slice(0, 5))) same += 1;
    }
    if (same >= 4) unset += 1;
  }
  return days > 0 && unset / days >= 0.9;
}

/** The newest day a year of rows covers, "YYYY-MM-DD", or "" for none. */
export function dptNewestDay(rows: DptRow[]): string {
  const days = rows.map((r) => String(r.d_date ?? "").slice(0, 10)).filter(Boolean);
  return days.length ? days.reduce((a, b) => (a > b ? a : b)) : "";
}

/**
 * Why a year of rows is no use today, in words for the mosque to act on, or "".
 * Either it has run out, or its congregation times were never entered.
 */
export function whyPluginNotUsable(rows: DptRow[], today: Ymd): string {
  if (rows.length === 0) return "that masjid has not put a timetable on its site yet";
  const newest = dptNewestDay(rows);
  if (newest && newest < isoDate(today)) return `that masjid's timetable stops at ${newest}; it needs updating on their website`;
  if (dptCongregationUnset(rows)) return "that masjid's site lists prayer start times but no congregation (iqama) times";
  return "";
}

/** Today's five iqamas out of a year of rows, or null if the year has no row for the day. */
export function dptDayFromRows(rows: DptRow[], today: Ymd, jumuah?: string[]): DayTimes | null {
  const key = isoDate(today);
  const row = rows.find((r) => String(r.d_date ?? "").slice(0, 10) === key);
  if (!row) return null;
  const iqama = {} as Record<PrayerKey, string>;
  const adhan = {} as Record<PrayerKey, string>;
  let haveAdhan = true;
  for (const [name, jamah, begins] of FIELDS) {
    const minutes = minutesOf(row[jamah]);
    if (minutes === null) return null;
    iqama[name] = hhmm(minutes);
    const start = minutesOf(row[begins]);
    if (start === null) haveAdhan = false;
    else adhan[name] = hhmm(start);
  }
  const out: DayTimes = { iqama, adhan: haveAdhan ? adhan : null };
  for (const value of jumuah ?? []) {
    const minutes = minutesOf(value);
    if (minutes !== null) {
      out.jumuah = hhmm(minutes);
      break;
    }
  }
  return out;
}

/** The Jumu'ah times out of the plugin's "today" answer. */
export function dptJumuah(payload: unknown): string[] {
  for (const row of dptRows(payload)) {
    const times = (row as { jumuah?: unknown }).jumuah;
    if (Array.isArray(times) && times.length) return times.map(String);
  }
  return [];
}
