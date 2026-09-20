/**
 * What to tell a person about a reading: where the times came from, how far to trust
 * them, and what is worth a second look.
 *
 * Words and decisions only, with no screen in them, so they are tested here and the
 * app just draws what it is given.
 */

import { maghribTime, checkAgainstSun, sunToday } from "./astro";
import { daysBetween, hhmm, isoDate, parseClock, parseIsoDate } from "./clock";
import type { Borrowed, Disagreement, MosqueOutcome } from "./pipeline";
import { warningsFor } from "./validate";
import { PRAYER_KEYS, type Confidence, type IqamaReading, type IqamaTimes, type MinutesByPrayer, type PrayerKey, type ReadingSource, type Where, type Ymd } from "./types";

/** Where the times on screen came from. "saved" is the research that ships with the app. */
export type MetaSource = ReadingSource | "saved";

/** Everything worth remembering about a reading besides its times. Plain data: it is stored as it is. */
export interface IqamaMeta {
  source: MetaSource;
  how?: Confidence;
  /** The day the times are for, "YYYY-MM-DD". For saved times, the day they were last checked; "" if not known. */
  asOf: string;
  /** The page or feed they were read from. */
  page?: string;
  /** Things worth a second look, in plain words. */
  warnings: string[];
  /** Prayers worked out from the sun rather than read. */
  computed?: PrayerKey[];
  /** Another source that read the same times. */
  corroboratedBy?: ReadingSource;
  /** Another source that read different ones, and where. */
  disagreement?: { prayers: PrayerKey[]; other: ReadingSource };
  /** For times borrowed from a neighbour: whose they are and how far away. */
  from?: { name: string; km: number };
  /** The day the page says these times change, "YYYY-MM-DD". */
  validUntil?: string;
}

export function metaFromReading(reading: IqamaReading, more: { disagreement?: Disagreement; from?: { name: string; km: number } } = {}): IqamaMeta {
  return {
    source: reading.source,
    how: reading.how,
    asOf: reading.asOf,
    ...(reading.page ? { page: reading.page } : {}),
    warnings: [...reading.warnings],
    ...(reading.computed.length ? { computed: [...reading.computed] } : {}),
    ...(reading.corroboratedBy ? { corroboratedBy: reading.corroboratedBy } : {}),
    ...(more.disagreement ? { disagreement: { prayers: [...more.disagreement.prayers], other: more.disagreement.other } } : {}),
    ...(more.from ? { from: { name: more.from.name, km: more.from.km } } : {}),
    ...(reading.validUntil ? { validUntil: reading.validUntil } : {}),
  };
}

export function metaFromOutcome(outcome: MosqueOutcome): IqamaMeta | null {
  return outcome.reading ? metaFromReading(outcome.reading, { disagreement: outcome.disagreement }) : null;
}

export function metaFromBorrowed(borrowed: Borrowed): IqamaMeta {
  return metaFromReading(borrowed.reading, { from: { name: borrowed.from.name, km: borrowed.from.km } });
}

// --- names ------------------------------------------------------------------------------------------

const BADGE: Record<MetaSource, string> = {
  plugin: "Mosque timetable",
  website: "Mosque website",
  mawaqit: "MAWAQIT",
  nearby: "Nearby mosque",
  saved: "Saved times",
};

const PHRASE: Record<MetaSource, string> = {
  plugin: "the mosque's timetable",
  website: "the mosque's website",
  mawaqit: "MAWAQIT",
  nearby: "a nearby mosque",
  saved: "the saved times",
};

const PRAYER_NAMES: Record<PrayerKey, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

/** The short name for a badge: "MAWAQIT", "Mosque website", "Saved times". */
export function sourceLabel(meta: Pick<IqamaMeta, "source" | "how">): string {
  if (meta.source === "website" && meta.how === "guessed") return "Website (unconfirmed)";
  return BADGE[meta.source];
}

export type Tone = "good" | "fair" | "caution";

/**
 * How much to lean on it, for the colour of a badge. Good is a source that says which
 * time is the iqama, is today's and raised nothing; caution is a guess, a neighbour's,
 * or a record old enough for the season to have changed.
 */
export function toneOf(meta: IqamaMeta, today: Ymd): Tone {
  if (meta.source === "nearby") return "caution";
  if (meta.source === "saved") {
    const age = ageInDays(meta.asOf, today);
    return age !== null && age <= 14 ? "fair" : "caution";
  }
  const age = ageInDays(meta.asOf, today);
  if (age !== null && age > 7) return "caution";
  if (meta.how === "guessed") return "caution";
  if ((age !== null && age > 0) || meta.disagreement || meta.warnings.length > 0) return "fair";
  return "good";
}

// --- whether to look again ---------------------------------------------------------------------------

/**
 * Whether what is on screen is the mosque's own reading for today. Saved research is
 * not, and neither is a neighbour's, and yesterday's is a day out of date: for those
 * the app looks again.
 */
export function isCurrent(meta: IqamaMeta | null | undefined, today: Ymd): boolean {
  if (!meta || meta.source === "saved" || meta.source === "nearby") return false;
  return meta.asOf === isoDate(today);
}

// --- what to say -------------------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03-15" as "Mar 15", or "Mar 15, 2025" in another year. Empty for anything that is not a date. */
export function formatDay(iso: string, today: Ymd): string {
  const day = parseIsoDate(iso);
  if (!day) return "";
  const text = `${MONTHS[day.month - 1]} ${day.day}`;
  return day.year === today.year ? text : `${text}, ${day.year}`;
}

function ageInDays(iso: string, today: Ymd): number | null {
  const day = parseIsoDate(iso);
  return day ? daysBetween(day, today) : null;
}

function listOf(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const done = capital(trimmed);
  return /[.!?]$/.test(done) ? done : `${done}.`;
}

/** One short line for tight places, such as the home screen: what the times are, and how old. */
export function headline(meta: IqamaMeta, today: Ymd): string {
  const label = sourceLabel(meta);
  if (meta.source === "saved") {
    const day = formatDay(meta.asOf, today);
    return day ? `${label} from ${day} · may have changed` : `${label} · age unknown`;
  }
  if (meta.source === "nearby") return meta.from ? `Approximate · ${meta.from.name}, ${meta.from.km} km away` : "Approximate · a nearby mosque";
  if (meta.how === "guessed") return `${label} · a best guess`;
  const day = meta.asOf && meta.asOf !== isoDate(today) ? formatDay(meta.asOf, today) : "";
  return day ? `${label} · times for ${day}` : label;
}

/** The lines to show under the times, most important first. */
export function notesFor(meta: IqamaMeta, today: Ymd): string[] {
  const notes: string[] = [];

  if (meta.source === "saved") {
    const day = formatDay(meta.asOf, today);
    notes.push(day ? `Saved from ${day}. Times change through the year: refresh to look for today's.` : "Saved times of unknown age. Refresh to look for today's.");
  } else if (meta.source === "nearby") {
    const from = meta.from ? `${meta.from.name}'s times, ${meta.from.km} km away` : "a nearby mosque's times";
    notes.push(`Approximate: these are ${from}. This mosque publishes none that could be read.`);
  } else if (meta.how === "guessed") {
    notes.push("The page doesn't say which times are the iqama, so these are a best guess.");
  }

  if (meta.disagreement) {
    const names = meta.disagreement.prayers.map((p) => PRAYER_NAMES[p]);
    notes.push(`${capital(PHRASE[meta.disagreement.other])} lists different times for ${listOf(names)}.`);
  } else if (meta.corroboratedBy) {
    notes.push(`Confirmed by ${PHRASE[meta.corroboratedBy]}.`);
  }

  if (meta.computed && meta.computed.length > 0) {
    notes.push(`${listOf(meta.computed.map((p) => PRAYER_NAMES[p]))} ${meta.computed.length === 1 ? "is" : "are"} worked out from the sunset time here.`);
  }

  for (const warning of meta.warnings) {
    const line = sentence(warning);
    if (line) notes.push(line);
  }

  if (meta.source !== "saved" && meta.asOf && meta.asOf !== isoDate(today)) {
    const day = formatDay(meta.asOf, today);
    if (day) notes.push(`These are the times for ${day}.`);
  }
  if (meta.validUntil) {
    const day = formatDay(meta.validUntil, today);
    if (day) notes.push(`The page says these change on ${day}.`);
  }
  return notes;
}

// --- research that ships with the app -----------------------------------------------------------------

export interface SavedRecord {
  /** What the research recorded, "HH:mm". Jumu'ah is "jummah" there. */
  times: Partial<Record<PrayerKey | "jummah", string>>;
  /** Maghrib as the mosque states it when it has no clock time: "sunset+5". */
  maghribRule?: string | null;
  /** The day the research was done, "YYYY-MM-DD". */
  researchedOn?: string | null;
}

export interface SavedTimes {
  times: IqamaTimes;
  jumuah?: string;
  meta: IqamaMeta;
}

/**
 * The times recorded when a mosque was researched, ready to show, as what they are:
 * old. Maghrib is worked out for today from "sunset+5" where that is how the mosque
 * states it, so it moves with the year and does not go stale as a clock time would.
 * The sun is asked about the rest, and objects in the meta rather than by hiding them:
 * they are on screen labelled as saved, and the app is looking for a fresher reading.
 */
export function savedTimes(record: SavedRecord, ctx: { today: Ymd; where?: Where | null }): SavedTimes | null {
  const times: IqamaTimes = {};
  const computed: PrayerKey[] = [];
  for (const prayer of PRAYER_KEYS) {
    const minutes = parseClock(record.times[prayer]);
    if (minutes !== null) times[prayer] = hhmm(minutes);
  }
  if (!times.maghrib && record.maghribRule && ctx.where) {
    const worked = maghribTime(record.maghribRule, ctx.where, ctx.today);
    if (worked) {
      times.maghrib = worked;
      computed.push("maghrib");
    }
  }
  const jumuahMinutes = parseClock(record.times.jummah);
  const jumuah = jumuahMinutes === null ? undefined : hhmm(jumuahMinutes);
  if (Object.keys(times).length === 0 && !jumuah) return null;

  const warnings: string[] = [];
  const sun = ctx.where ? sunToday(ctx.where, ctx.today) : null;
  if (sun) {
    const minutes: Partial<MinutesByPrayer> = {};
    for (const prayer of PRAYER_KEYS) {
      const m = parseClock(times[prayer]);
      if (m !== null) minutes[prayer] = m;
    }
    const objection = checkAgainstSun(minutes, sun);
    if (objection) warnings.push(objection);
  }

  const meta: IqamaMeta = { source: "saved", asOf: record.researchedOn ?? "", warnings, ...(computed.length ? { computed } : {}) };
  return { times, ...(jumuah ? { jumuah } : {}), meta };
}

/** What a mosque in the app's list carries of its times: bundled research, or a MAWAQIT search result. */
export interface ListedTimes {
  discoveredIqama?: Partial<Record<PrayerKey | "jummah", string>> | null;
  maghribRule?: string | null;
  iqamaSource?: string | null;
  /** When they were read (a MAWAQIT result) or researched (the bundle): an ISO date or date-time. */
  iqamaLastFetched?: string | null;
}

/**
 * The times a listing came with, as what they are. A MAWAQIT search result is exact but
 * unconfirmed, and dated by when it was fetched; anything else is the bundled research,
 * which is saved times. For when the mosque's own page has not been read, or cannot be.
 */
export function timesFromListing(entry: ListedTimes, ctx: { today: Ymd; where?: Where | null }): SavedTimes | null {
  const found = entry.discoveredIqama;
  if (!found) return null;
  const day = (entry.iqamaLastFetched ?? "").slice(0, 10);
  if (entry.iqamaSource !== "mawaqit") return savedTimes({ times: found, maghribRule: entry.maghribRule, researchedOn: day }, ctx);

  const times: IqamaTimes = {};
  for (const prayer of PRAYER_KEYS) {
    const minutes = parseClock(found[prayer]);
    if (minutes !== null) times[prayer] = hhmm(minutes);
  }
  if (Object.keys(times).length === 0) return null;
  const whole = PRAYER_KEYS.every((p) => times[p] !== undefined);
  const warnings = whole ? warningsFor(times as Record<PrayerKey, string>, { today: ctx.today, where: ctx.where }) : [];
  const jumuahMinutes = parseClock(found.jummah);
  return {
    times,
    ...(jumuahMinutes === null ? {} : { jumuah: hhmm(jumuahMinutes) }),
    meta: { source: "mawaqit", how: "exact", asOf: parseIsoDate(day) ? day : "", warnings },
  };
}
