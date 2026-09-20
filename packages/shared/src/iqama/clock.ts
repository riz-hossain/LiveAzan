/**
 * Calendar days and clock times, without a time-zone database.
 *
 * A mosque's "today" is a day on its own wall, and a page's dates are days on
 * that wall too, so days are plain year/month/day values here and never Date
 * objects that a phone's time zone could shift.
 */

import type { Ymd } from "./types";

const DAY_MS = 86_400_000;

export function ymd(year: number, month: number, day: number): Ymd {
  return { year, month, day };
}

/** The day on this device's own wall right now. */
export function todayHere(now: Date = new Date()): Ymd {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

export function isValidYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

/** Days since 1970-01-01. */
export function dayNumber(d: Ymd): number {
  return Math.round(Date.UTC(d.year, d.month - 1, d.day) / DAY_MS);
}

export function fromDayNumber(n: number): Ymd {
  const date = new Date(n * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function addDays(d: Ymd, n: number): Ymd {
  return fromDayNumber(dayNumber(d) + n);
}

/** b - a, in whole days. */
export function daysBetween(a: Ymd, b: Ymd): number {
  return dayNumber(b) - dayNumber(a);
}

export function sameDay(a: Ymd, b: Ymd): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(d: Ymd): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

export function isFriday(d: Ymd): boolean {
  return weekday(d) === 5;
}

export function isoDate(d: Ymd): string {
  return `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

export function parseIsoDate(text: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text ?? ""));
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return isValidYmd(year, month, day) ? { year, month, day } : null;
}

/** 375 -> "06:15". Wraps past midnight, so 1475 is "00:35". */
export function hhmm(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "6:15" or "06:15:00" -> 375. Null for anything that is not a 24-hour clock time. */
export function parseClock(text: unknown): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(text ?? ""));
  if (!m) return null;
  const [hour, minute] = [Number(m[1]), Number(m[2])];
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * The day on the wall of an IANA zone right now, or this device's own day where the
 * runtime cannot say. A server in UTC asked about a mosque in Vancouver at eight in
 * the evening is asking about a day that is over in Greenwich and not yet in British
 * Columbia, and it is the mosque's day that its timetable is for.
 */
export function todayInZone(timeZone: string | undefined, now: Date = new Date()): Ymd {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
      const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
      const found = { year: get("year"), month: get("month"), day: get("day") };
      if (isValidYmd(found.year, found.month, found.day)) return found;
    } catch {
      // fall through to the device's own day
    }
  }
  return todayHere(now);
}

/**
 * This device's UTC offset on that day, in hours (daylight time included).
 * On a server this is the server's own zone, which is usually UTC: pass the
 * mosque's zone through offsetHoursForZone instead.
 */
export function localOffsetHours(d: Ymd): number {
  const noon = new Date(d.year, d.month - 1, d.day, 12, 0, 0);
  return -noon.getTimezoneOffset() / 60;
}

/**
 * The UTC offset of an IANA zone on that day, in hours, or undefined where the
 * runtime cannot say (an engine without time-zone support).
 */
export function offsetHoursForZone(d: Ymd, timeZone: string): number | undefined {
  try {
    const at = new Date(Date.UTC(d.year, d.month - 1, d.day, 12));
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).formatToParts(at);
    const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
    const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    const offset = (wall - at.getTime()) / 3_600_000;
    return Number.isFinite(offset) ? offset : undefined;
  } catch {
    return undefined;
  }
}

const PROVINCE_ZONES: Record<string, string> = {
  "british columbia": "America/Vancouver",
  bc: "America/Vancouver",
  alberta: "America/Edmonton",
  ab: "America/Edmonton",
  saskatchewan: "America/Regina",
  sk: "America/Regina",
  manitoba: "America/Winnipeg",
  mb: "America/Winnipeg",
  ontario: "America/Toronto",
  on: "America/Toronto",
  quebec: "America/Toronto",
  "québec": "America/Toronto",
  qc: "America/Toronto",
  "new brunswick": "America/Halifax",
  nb: "America/Halifax",
  "nova scotia": "America/Halifax",
  ns: "America/Halifax",
  "prince edward island": "America/Halifax",
  pei: "America/Halifax",
  pe: "America/Halifax",
  "newfoundland and labrador": "America/St_Johns",
  newfoundland: "America/St_Johns",
  nl: "America/St_Johns",
  yukon: "America/Whitehorse",
  yt: "America/Whitehorse",
  "northwest territories": "America/Edmonton",
  nt: "America/Edmonton",
  nunavut: "America/Iqaluit",
  nu: "America/Iqaluit",
};

/**
 * The IANA zone a mosque keeps time in, judged from its province and longitude.
 *
 * Good for Canada, where the province nearly always settles it; the few places
 * a province straddles two zones are told apart by longitude. Undefined for
 * anywhere else, where a caller should fall back to the device's own zone.
 */
export function zoneForPlace(place: { province?: string; country?: string; longitude?: number }): string | undefined {
  const country = String(place.country ?? "Canada").trim().toLowerCase();
  if (country && country !== "canada" && country !== "ca") return undefined;
  const zone = PROVINCE_ZONES[String(place.province ?? "").trim().toLowerCase()];
  if (!zone) return undefined;
  const lon = place.longitude;
  if (typeof lon === "number") {
    if (zone === "America/Toronto" && lon < -90) return "America/Winnipeg"; // north-west Ontario
    if (zone === "America/Toronto" && lon > -62) return "America/Halifax"; // the Magdalen Islands
  }
  return zone;
}
