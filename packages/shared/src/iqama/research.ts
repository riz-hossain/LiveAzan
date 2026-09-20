/**
 * Keeping a reading: whether one is fit to be stored where nobody will see how it was
 * arrived at, and how it goes into a mosque's research record.
 *
 * The phone can label a guess, a disputed reading or a neighbour's; a database row or a
 * line in a data file cannot, and to whoever reads it later it is simply the mosque's
 * iqama. So only a reading that could be shown to everyone without a word of caution
 * is kept, and for the rest the previous times stay.
 */

import { isoDate } from "./clock";
import type { MosqueOutcome } from "./pipeline";
import { PRAYER_KEYS, type IqamaReading, type PrayerKey, type Ymd } from "./types";

export type Verdict = { ok: true; reading: IqamaReading } | { ok: false; why: string };

/**
 * Whether a reading may be stored, and if not, why not in words for a person. A page
 * that names no column, a source that raised a warning, and two sources that disagree
 * are all left alone.
 */
export function usable(outcome: MosqueOutcome): Verdict {
  const reading = outcome.reading;
  if (!reading) return { ok: false, why: outcome.problems.length > 0 ? outcome.problems.join("; ") : "nothing could be read" };
  if (reading.source === "nearby") return { ok: false, why: "these are a neighbouring mosque's times" };
  if (reading.how === "guessed") return { ok: false, why: "the page does not say which of its times are the iqama" };
  if (reading.warnings.length > 0) return { ok: false, why: reading.warnings.join("; ") };
  if (outcome.disagreement) {
    const names = outcome.disagreement.prayers.join(", ");
    return { ok: false, why: `${outcome.disagreement.other} lists different times for ${names}` };
  }
  return { ok: true, reading };
}

// --- the research record ----------------------------------------------------------------------------

/** The part of a mosque in the research data files (data/mosques/**) that a reading touches. */
export interface ResearchRecord {
  iqamaTimes?: Partial<Record<PrayerKey | "jummah", string>> | null;
  sources?: string[];
  /** The day the times were read, "YYYY-MM-DD"; where absent, the file's lastResearched is the day. */
  iqamaAsOf?: string;
  [key: string]: unknown;
}

export interface ResearchUpdate {
  record: ResearchRecord;
  /** The prayers whose time was written. */
  wrote: PrayerKey[];
  /** When nothing was written, why not. */
  why?: string;
}

const SOURCE_NAME = { mawaqit: "mawaqit.net", website: "website", plugin: "website", nearby: "" } as const;

/** Whether a recorded time is a rule such as "sunset+5" rather than a clock time. */
const isRule = (value: string | undefined): boolean => !!value && /sunset/i.test(value);

/**
 * A mosque's research record with a reading in it, or the record as it was and the
 * reason. The record is not changed in place.
 *
 * A Maghrib the page gave as "sunset + 5" is written as that rule, "sunset+5", and not as
 * the time it comes to today, which would be wrong within the week: the app and the server
 * work the rule out for the day they are asked about. (Where the reading has no rule but
 * its Maghrib was worked out from the sun, a rule already in the record is kept, and a
 * clock time is better than nothing.) Jumu'ah is added when the source has it and never
 * removed when it does not.
 */
export function updateResearch(record: ResearchRecord, outcome: MosqueOutcome, today: Ymd): ResearchUpdate {
  const verdict = usable(outcome);
  if (!verdict.ok) return { record, wrote: [], why: verdict.why };

  const reading = verdict.reading;
  const times: NonNullable<ResearchRecord["iqamaTimes"]> = { ...(record.iqamaTimes ?? {}) };
  const wrote: PrayerKey[] = [];
  for (const prayer of PRAYER_KEYS) {
    if (prayer === "maghrib" && reading.computed.includes("maghrib")) {
      if (reading.maghribRule) times.maghrib = reading.maghribRule;
      else if (isRule(times.maghrib)) continue;
      else times.maghrib = reading.times.maghrib;
    } else {
      times[prayer] = reading.times[prayer];
    }
    wrote.push(prayer);
  }
  if (reading.jumuah) times.jummah = reading.jumuah;

  const sources = [...(record.sources ?? [])];
  const source = SOURCE_NAME[reading.source];
  if (source && !sources.includes(source)) sources.push(source);

  return { record: { ...record, iqamaTimes: times, sources, iqamaAsOf: isoDate(today) }, wrote };
}
