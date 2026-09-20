/**
 * Where the sun is, so a mosque's page can be checked and completed.
 *
 * Two things a page cannot always give, and the sun can:
 *
 *  - Maghrib. A great many mosques write it as "Sunset" or "5 minutes after
 *    sunset" rather than as a time, because that is what it is. With where the
 *    mosque is and what day it is, that is a time.
 *  - A check on everything else. A page can be perfectly formatted and a whole
 *    season out of date -- a table of June times still up in September, headed
 *    "Today's board". Nothing in the table gives it away; the sun does. Maghrib
 *    cannot be an hour after sunset in September, whatever the table says.
 *
 * This is the NOAA solar calculation, good to a minute or two, which is all
 * either purpose needs. It does not compute Fajr or Isha (those depend on a
 * method every mosque chooses for itself); the checks on them are deliberately
 * loose.
 *
 * Times are minutes after local midnight on whatever clock the UTC offset
 * describes.
 */

import { dayNumber, localOffsetHours } from "./clock";
import type { MinutesByPrayer, Where, Ymd } from "./types";

/**
 * Maghrib's adhan falls a little after the geometric sunset, and calendars agree
 * on how much. Measured against 70 Canadian mosques on MAWAQIT, whose adhan is
 * calculated the same way.
 */
export const ADHAN_AFTER_SUNSET = 1.0;

export interface Sun {
  sunrise: number;
  noon: number;
  sunset: number;
  /** When the sun is 20 degrees below the horizon before sunrise; null in a northern summer. */
  dawn: number | null;
}

const rad = (x: number): number => (x * Math.PI) / 180;
const deg = (x: number): number => (x * 180) / Math.PI;

/** [the sun's declination in degrees, solar noon in minutes after local midnight]. */
function solar(lon: number, day: Ymd, utcOffsetHours: number): [number, number] {
  // Julian day at local noon, then centuries since J2000.
  const jd = dayNumber(day) + 2440587.5 + 0.5 - utcOffsetHours / 24;
  const t = (jd - 2451545.0) / 36525.0;
  const l0 = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(rad(m)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(rad(2 * m)) * (0.019993 - 0.000101 * t) +
    Math.sin(rad(3 * m)) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const apparent = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const meanObliq = 23.0 + (26.0 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60.0) / 60.0;
  const obliq = meanObliq + 0.00256 * Math.cos(rad(omega));
  const decl = deg(Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(apparent))));
  const y = Math.tan(rad(obliq / 2.0)) ** 2;
  const eqTime =
    4.0 *
    deg(
      y * Math.sin(2 * rad(l0)) -
        2 * e * Math.sin(rad(m)) +
        4 * e * y * Math.sin(rad(m)) * Math.cos(2 * rad(l0)) -
        0.5 * y * y * Math.sin(4 * rad(l0)) -
        1.25 * e * e * Math.sin(2 * rad(m))
    );
  return [decl, 720.0 - 4.0 * lon - eqTime + utcOffsetHours * 60.0];
}

/** Degrees of the sun's travel from noon to when it stands at `altitude`, or null. */
function hourAngle(lat: number, decl: number, altitude: number): number | null {
  const cosine =
    (Math.sin(rad(altitude)) - Math.sin(rad(lat)) * Math.sin(rad(decl))) / (Math.cos(rad(lat)) * Math.cos(rad(decl)));
  if (!(cosine >= -1 && cosine <= 1)) return null;
  return deg(Math.acos(cosine));
}

/**
 * Sunrise, solar noon, sunset and first light for a day, or null if it cannot be
 * known: no sunrise or sunset that day (far north, near midsummer), or a place
 * outside the range this is good for.
 *
 * On the device's own clock unless the mosque's UTC offset is given. It should
 * be whenever it is known: a mosque in Edmonton followed from an Eastern phone
 * has its sun two hours from where that clock puts it, and every honest table
 * would look impossible.
 */
export function sunToday(where: Where, day: Ymd): Sun | null {
  const { lat, lon } = where;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -66 || lat > 66 || lon < -180 || lon > 180) return null;
  const offset = where.utcOffsetHours ?? localOffsetHours(day);
  const [decl, noon] = solar(lon, day, offset);
  const rise = hourAngle(lat, decl, -0.833);
  if (rise === null) return null;
  const first = hourAngle(lat, decl, -20);
  return {
    sunrise: noon - 4 * rise,
    noon,
    sunset: noon + 4 * rise,
    dawn: first === null ? null : noon - 4 * first,
  };
}

// --- Maghrib written as words ---------------------------------------------------
const SUNSET = /sun\s?set/;
const ADHAN = /adh?aa?n|ath?aa?n|azaa?n/;
const OFFSET = /(?:\+\s*(\d{1,2})|(\d{1,2})\s*(?:min|mins|minute|minutes)\b)/;

/**
 * Maghrib's iqama, in minutes after midnight, from how a page describes it:
 * "Sunset", "At sunset", "3 minutes after sunset", "Sunset + 5", "5 min after
 * Adhan". Null for anything that says neither, so that a page which is not
 * talking about Maghrib's timing at all is not read as though it were.
 */
export function maghribFromWords(text: string, sunset: number): number | null {
  const low = String(text ?? "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
  const bySunset = SUNSET.test(low);
  const byAdhan = ADHAN.test(low);
  if (!bySunset && !byAdhan) return null;
  // The adhan follows the sun a minute or so later; "after adhan" counts from it.
  const base = sunset + (byAdhan && !bySunset ? ADHAN_AFTER_SUNSET : 0);
  const m = OFFSET.exec(low);
  if (m) return Math.round(base + Number(m[1] ?? m[2]));
  return Math.round(base);
}

// --- is this table the right season? --------------------------------------------

function clock(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * "" when the five iqamas are plausible for that sun, else what is wrong.
 *
 * How far from the sun each may fall is wide on purpose: these catch a page a
 * season out of date, not a mosque's own choices.
 */
export function checkAgainstSun(times: Partial<MinutesByPrayer>, sun: Sun | null): string {
  if (sun === null) return "";
  const { sunrise, noon, sunset, dawn } = sun;
  const fajrLow = Math.max(sunrise - 230, dawn ?? Number.NEGATIVE_INFINITY);
  const windows: Array<[keyof MinutesByPrayer, number, number, string]> = [
    [
      "fajr",
      fajrLow,
      sunrise - 5,
      dawn !== null ? `sunrise is ${clock(sunrise)} and dawn no earlier than ${clock(dawn)}` : `sunrise is ${clock(sunrise)}`,
    ],
    ["dhuhr", noon - 5, noon + 150, `solar noon is ${clock(noon)}`],
    ["asr", noon + 80, sunset - 5, `noon is ${clock(noon)} and sunset ${clock(sunset)}`],
    ["maghrib", sunset - 3, sunset + 50, `sunset is ${clock(sunset)}`],
    ["isha", sunset + 35, Math.min(sunset + 330, 23 * 60 + 59), `sunset is ${clock(sunset)}`],
  ];
  for (const [prayer, low, high, why] of windows) {
    const value = times[prayer];
    if (value === undefined) continue;
    if (value < low || value > high) {
      const name = prayer.charAt(0).toUpperCase() + prayer.slice(1);
      return `${name} at ${clock(value)} is not possible on this day here (${why})`;
    }
  }
  return "";
}

/**
 * Maghrib's iqama for a day as "HH:mm", from words like "sunset + 5" -- the way a mosque's
 * own records often write it -- and where the mosque is. Null if either is missing.
 */
export function maghribTime(words: string, where: Where, day: Ymd): string | null {
  const sun = sunToday(where, day);
  if (!sun) return null;
  const minutes = maghribFromWords(words, sun.sunset);
  if (minutes === null) return null;
  const total = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
