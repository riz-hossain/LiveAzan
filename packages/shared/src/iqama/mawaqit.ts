/**
 * Iqama times from MAWAQIT, and the search that finds a mosque there.
 *
 * MAWAQIT (mawaqit.net) is a waqf project carrying several thousand mosques,
 * most densely in France but reaching well beyond it. A mosque there is found by
 * a point on the map (or a name), and its page carries a whole year of times.
 *
 * Two shapes of the same data are read here:
 *
 *  - a search result, which carries today's adhan (`times`, six) and today's
 *    iqama (`iqama`, five) -- enough for a list, in one request;
 *  - the mosque's page, whose `confData` carries the whole year: `calendar` is
 *    the adhan, six times a day (fajr, shuruq, dhuhr, asr, maghrib, isha), and
 *    `iqamaCalendar` is the congregation, five -- the same minus shuruq.
 *
 * That gap matters. An iqama entry can be an offset like "+10" rather than a time,
 * and it is added to *its own* prayer's adhan, which is not the entry at the same
 * index. Line them up wrongly and every prayer of the year is quietly at the
 * wrong time.
 *
 * The addresses that work, learned the hard way:
 *
 *   search   https://mawaqit.net/api/2.0/mosque/search?lat=&lon=&radius=   (radius in km)
 *   page     https://mawaqit.net/en/<slug>
 *
 * (`/en/api/2.0/...` is a 404, and `/api/2.0/mosque/<uuid>` needs a key.)
 *
 * A listing is exact about what it holds and can still be wrong about today: a
 * schedule set up last winter, or one whose iqama offsets were never entered,
 * looks perfectly well-formed. Nothing here can tell; validate.ts and the
 * pipeline compare it against the mosque's own site when there is one.
 */

import { hhmm, parseClock } from "./clock";
import type { DayTimes, PrayerKey, Ymd } from "./types";

export const MAWAQIT_HOST = "https://mawaqit.net";
export const SEARCH_PATH = "/api/2.0/mosque/search";

export class MawaqitError extends Error {}

/** iqamaCalendar's five, and which of calendar's six each one follows. Shuruq (1) is sunrise, not a prayer. */
const IQAMA_ORDER: ReadonlyArray<readonly [PrayerKey, number]> = [
  ["fajr", 0],
  ["dhuhr", 2],
  ["asr", 3],
  ["maghrib", 4],
  ["isha", 5],
];

// --- addresses --------------------------------------------------------------
export function looksLikeMawaqit(url: string): boolean {
  return /mawaqit\.net/i.test(url ?? "");
}

/**
 * The mosque's slug out of any mawaqit address: /en/<slug>, /fr/m/<slug>, /w/<slug>.
 * People paste whichever of those their browser showed, and a mosque's own site
 * usually embeds the widget form.
 */
export function mawaqitSlug(url: string): string {
  const text = String(url ?? "").trim();
  if (!text) return "";
  if (!/mawaqit\.net/i.test(text)) return text.replace(/^\/+|\/+$/g, "");
  const path = /mawaqit\.net([^?#]*)/i.exec(text)?.[1] ?? "";
  const parts = path.split("/").filter(Boolean);
  while (parts.length && (parts[0].length === 2 || parts[0] === "m" || parts[0] === "w")) parts.shift();
  return parts[0] ?? "";
}

export const mawaqitPageUrl = (slug: string): string => `${MAWAQIT_HOST}/en/${slug.replace(/^\/+|\/+$/g, "")}`;

export function mawaqitSearchUrl(lat: number, lon: number, radiusKm = 5): string {
  return `${MAWAQIT_HOST}${SEARCH_PATH}?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&radius=${Math.round(radiusKm)}`;
}

// --- a search result -----------------------------------------------------------
export interface MawaqitSearchItem {
  uuid?: string;
  slug?: string;
  name?: string;
  label?: string;
  latitude?: number;
  longitude?: number;
  /** Today's adhan: fajr, shuruq, dhuhr, asr, maghrib, isha. */
  times?: string[];
  /** Today's iqama: fajr, dhuhr, asr, maghrib, isha -- clock times or offsets. */
  iqama?: Array<string | number | null>;
  iqamaEnabled?: boolean | null;
  jumua?: string | null;
  jumuaAsDuhr?: boolean;
  site?: string | null;
  localisation?: string;
}

/** The masjids in a search response, whichever wrapper it came in. */
export function parseMawaqitSearch(payload: unknown): MawaqitSearchItem[] {
  const list = Array.isArray(payload) ? payload : ((payload as { mosques?: unknown } | null)?.mosques ?? []);
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is MawaqitSearchItem => !!item && typeof item === "object" && !!(item as MawaqitSearchItem).slug);
}

/** The minutes in "+10" or 10, or null when this is not an offset at all. */
function offsetOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const m = /^\s*([+-]\d{1,3})\s*$/.exec(String(value ?? ""));
  return m ? Number(m[1]) : null;
}

/** One prayer's congregation time, from a clock entry or an offset from its adhan. */
function momentOf(entry: unknown, adhan: string | undefined): number | null {
  const clock = typeof entry === "string" ? parseClock(entry) : null;
  if (clock !== null) return clock;
  const offset = offsetOf(entry);
  if (offset === null || adhan === undefined) return null;
  const base = parseClock(adhan);
  return base === null ? null : base + offset;
}

export type MawaqitDay = DayTimes;

function assemble(entries: ArrayLike<unknown>, adhans: ArrayLike<unknown> | null): MawaqitDay | null {
  const iqama = {} as Record<PrayerKey, string>;
  const adhan = {} as Record<PrayerKey, string>;
  let haveAdhan = adhans !== null;
  for (let slot = 0; slot < IQAMA_ORDER.length; slot++) {
    const [name, index] = IQAMA_ORDER[slot];
    const a = adhans && index < adhans.length ? String(adhans[index] ?? "") : undefined;
    if (a !== undefined && parseClock(a) !== null) adhan[name] = hhmm(parseClock(a)!);
    else haveAdhan = false;
    const minutes = slot < entries.length ? momentOf(entries[slot], a) : null;
    if (minutes === null) return null;
    iqama[name] = hhmm(minutes);
  }
  return { iqama, adhan: haveAdhan ? adhan : null };
}

/**
 * Today's iqama from a search result: the one request that answers for a whole list.
 * Null when the masjid has switched congregation times off, or the entry is incomplete.
 */
export function mawaqitDayFromSearch(item: MawaqitSearchItem): MawaqitDay | null {
  if (item.iqamaEnabled === false) return null;
  if (!Array.isArray(item.iqama) || !Array.isArray(item.times)) return null;
  const day = assemble(item.iqama, item.times);
  if (!day) return null;
  const jumuah = parseClock(item.jumua);
  if (jumuah !== null) {
    day.jumuah = hhmm(jumuah);
    day.jumuahAsDuhr = !!item.jumuaAsDuhr;
  }
  return day;
}

// --- a mosque's page --------------------------------------------------------------
export interface MawaqitConf {
  name?: string;
  calendar?: unknown;
  iqamaCalendar?: unknown;
  iqamaEnabled?: boolean | null;
  jumua?: string | null;
  jumua2?: string | null;
  jumuaAsDuhr?: boolean;
  [key: string]: unknown;
}

/**
 * The confData object a mosque's page carries its whole year in.
 *
 * Brace-matched rather than regexed to the closing brace: the object holds
 * announcement text, and any of that may contain braces or quotes.
 */
export function parseMawaqitConf(html: string): MawaqitConf {
  const marker = /confData\s*=\s*/.exec(html);
  if (!marker) throw new MawaqitError("that mawaqit page carries no timetable");
  const start = html.indexOf("{", marker.index + marker[0].length);
  if (start === -1) throw new MawaqitError("that mawaqit page carries no timetable");
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = start;
  for (; end < html.length; end++) {
    const char = html[end];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  try {
    return JSON.parse(html.slice(start, end + 1)) as MawaqitConf;
  } catch {
    throw new MawaqitError("that mawaqit page's timetable is unreadable");
  }
}

/**
 * One day's row out of a twelve-month table, whatever shape it is in. The months are
 * a list; the days inside are usually an object keyed by the day number as a string,
 * and occasionally a plain list.
 */
function monthDay(table: unknown, month: number, day: number): unknown {
  if (!Array.isArray(table) || month < 1 || month > table.length) return undefined;
  const entry = table[month - 1];
  if (Array.isArray(entry)) return day >= 1 && day <= entry.length ? entry[day - 1] : undefined;
  if (entry && typeof entry === "object") return (entry as Record<string, unknown>)[String(day)];
  return undefined;
}

/** Today's iqama out of a mosque's whole year. Null if the year has no row for the day. */
export function mawaqitDayFromPage(conf: MawaqitConf, day: Ymd): MawaqitDay | null {
  const adhan = monthDay(conf.calendar, day.month, day.day);
  const iqama = monthDay(conf.iqamaCalendar, day.month, day.day);
  if (!Array.isArray(iqama)) return null;
  const out = assemble(iqama, Array.isArray(adhan) ? adhan : null);
  if (!out) return null;
  const jumuah = parseClock(conf.jumua);
  if (jumuah !== null) {
    out.jumuah = hhmm(jumuah);
    out.jumuahAsDuhr = !!conf.jumuaAsDuhr;
  }
  return out;
}

/**
 * Whether the iqama table just says "at the adhan" all year.
 *
 * Four of five prayers at +0 (or at the very minute of the adhan) on nearly every
 * day is a table nobody filled in. One at +0 -- Maghrib -- is normal.
 */
export function iqamaTableUnset(calendar: unknown, iqamaCalendar: unknown): boolean {
  if (!Array.isArray(iqamaCalendar)) return false;
  let days = 0;
  let unset = 0;
  iqamaCalendar.forEach((table, monthIndex) => {
    if (!table || typeof table !== "object") return;
    const rows: Array<[string, unknown]> = Array.isArray(table) ? table.map((v, i) => [String(i + 1), v]) : Object.entries(table);
    for (const [dayKey, entries] of rows) {
      if (!Array.isArray(entries) || entries.length < 5) continue;
      days += 1;
      const adhan = /^\d+$/.test(dayKey) ? monthDay(calendar, monthIndex + 1, Number(dayKey)) : undefined;
      let same = 0;
      IQAMA_ORDER.forEach(([, index], slot) => {
        const entry = String(entries[slot] ?? "").trim();
        const offset = offsetOf(entry);
        if (offset === 0 || entry === "0") {
          same += 1;
        } else if (Array.isArray(adhan) && index < adhan.length) {
          const a = parseClock(adhan[index]);
          const e = parseClock(entry);
          if (e !== null && a !== null && e === a) same += 1;
        }
      });
      if (same >= 4) unset += 1;
    }
  });
  return days > 0 && unset / days >= 0.9;
}

/**
 * Whether a whole page's worth of MAWAQIT can be trusted to carry congregation
 * times at all. A reason in words when it cannot, "" when it can.
 */
export function whyMawaqitNotUsable(conf: MawaqitConf): string {
  if (!Array.isArray(conf.calendar) || !Array.isArray(conf.iqamaCalendar)) return "that masjid has no timetable on mawaqit yet";
  if (conf.iqamaEnabled === false) return "that masjid has switched its congregation times off on mawaqit";
  if (iqamaTableUnset(conf.calendar, conf.iqamaCalendar)) {
    return "that masjid's mawaqit page lists prayer start times but no congregation times";
  }
  return "";
}
