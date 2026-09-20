/**
 * Shared vocabulary for reading a mosque's iqama times.
 *
 * Nothing in this folder touches the network, the DOM or React Native: it takes
 * text in and gives readings out, so the same code runs in the app, on the
 * server and under test. Whatever fetches the pages is handed in (see
 * pipeline.ts).
 */

export type PrayerKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

/** The five, in the order they fall through the day. */
export const PRAYER_KEYS: readonly PrayerKey[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

/** A calendar day, with no time zone attached: the day on the mosque's own wall. */
export interface Ymd {
  year: number;
  month: number; // 1-12
  day: number;
}

/** Where a mosque is. The offset is the mosque's own UTC offset in hours, when known. */
export interface Where {
  lat: number;
  lon: number;
  utcOffsetHours?: number;
}

/** Iqama times as "HH:mm", 24-hour. Same shape the app already keeps. */
export type IqamaTimes = Partial<Record<PrayerKey, string>>;

/** All five, in minutes after local midnight. */
export type MinutesByPrayer = Record<PrayerKey, number>;

/**
 * How sure a reading is.
 *
 *  exact    from a data feed (MAWAQIT, the mosque's own timetable plugin)
 *  labelled read off a page that says which time is the iqama ("Iqama: 6:00 AM")
 *  headed   read off a table whose columns are named in a header
 *  guessed  read off a page that names no column, judged from the numbers alone
 */
export type Confidence = "exact" | "labelled" | "headed" | "guessed";

/** Where a reading came from. */
export type ReadingSource = "mawaqit" | "plugin" | "website" | "nearby";

export interface IqamaReading {
  /** All five iqamas, "HH:mm". */
  times: Record<PrayerKey, string>;
  source: ReadingSource;
  how: Confidence;
  /** The day these times are for, "YYYY-MM-DD". */
  asOf: string;
  /** The page or feed they were read from. */
  page?: string;
  /** Prayers worked out from the sun rather than read (Maghrib written as "sunset"). */
  computed: PrayerKey[];
  /** When Maghrib is worked out from the sun, the rule the page gave it by: "sunset+5". */
  maghribRule?: string;
  /** Whether the sun was consulted: it was, if the mosque's position was known. */
  sunChecked: boolean;
  /** The first Jumu'ah time, "HH:mm", when the source has it. */
  jumuah?: string;
  /** The day the page says these times change, "YYYY-MM-DD", when it says. */
  validUntil?: string;
  /** Another source that read the same times, within ten minutes: two records of one thing agreeing. */
  corroboratedBy?: ReadingSource;
  /** Things worth a person's second look, in plain words. */
  warnings: string[];
}

/** One day's five iqamas, and the adhans they follow when the source has them. */
export interface DayTimes {
  /** All five iqamas, "HH:mm". */
  iqama: Record<PrayerKey, string>;
  /** All five adhans, "HH:mm", when the source has them. */
  adhan: Record<PrayerKey, string> | null;
  /** The first Jumu'ah time, "HH:mm", and whether it stands in for Dhuhr. */
  jumuah?: string;
  jumuahAsDuhr?: boolean;
}
