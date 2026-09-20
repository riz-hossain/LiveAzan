/**
 * Reading a mosque's iqama times off an ordinary web page.
 *
 * The last resort. MAWAQIT and the WordPress timetable plugin hand over
 * structured data; this is for the mosque whose site simply prints its times.
 * Nothing here can be exact the way those are, so the whole design is about not
 * being wrong. A page is read only when it says which times are the
 * congregation's, and whatever is read still has to pass checks that a genuine
 * timetable passes and a misreading does not:
 *
 *  - the five run in order, and each is where that prayer can fall;
 *  - where both an adhan and an iqama are printed, the iqama follows its adhan;
 *  - a table whose adhan times are all on the hour or half hour is a template
 *    waiting to be filled in, not a timetable;
 *  - a date printed beside the times must be today's;
 *  - and, when the mosque's position is known, the sun must agree: a table of
 *    June times on a September page is well-formed in every respect and
 *    impossible in one (Maghrib cannot be two hours after sunset).
 *
 * What it reads is what is in the HTML it is given. Times that a script fills in
 * afterwards are not there -- the page holds a "-" or a "12:00 am" -- and those
 * mosques have to be reached some other way (see pipeline.ts).
 *
 * Layouts seen on real mosque sites, all handled:
 *
 *     Fajr 5:37 AM  Iqama: 6:00 AM          one line, labelled
 *     Fajr / Athan 5:49 / Iqamah 6:15       a stack, labelled
 *     | Fajr | 5:45 am | 6:15 am |          a table, columns named in a header
 *     FAJR 6:15 AM  ATHAN: 05:41 AM         the iqama first, the adhan labelled
 *     Fajr / 5:46 AM / 6:15 AM              a stack, columns named above it
 *     Fajr: 6:10 am ... Magrib: 3 minutes   one time each, Maghrib in words
 *         after sunset
 *     Fajr, Dhuhr ... then 6:15, 1:45 ...   all the names, then all the times
 *     Adhan / Iqama rows under the names    the table turned on its side
 *
 * A single time per prayer under no label is either the adhan or the iqama and
 * the page does not say -- which is exactly the mistake that shows Fajr an hour
 * early. It is accepted only when the times look chosen by a person: nearly all
 * on a multiple of five minutes, which calculated adhan times are not.
 *
 * This is a port of the reader in the floating-clock desktop app, where it was
 * measured on 160 real mosque websites; the layouts and refusals above are what
 * that turned up.
 */

import { checkAgainstSun, maghribFromWords, sunToday, type Sun } from "./astro";
import { dayNumber, daysBetween, hhmm, isoDate, isValidYmd, sameDay } from "./clock";
import { findCoordinates, flatten } from "./html";
import { PRAYER_KEYS, type Confidence, type MinutesByPrayer, type PrayerKey, type Where, type Ymd } from "./types";

/**
 * Where each iqama can fall on a mosque's own clock, in any month, anywhere in
 * Canada -- minutes after midnight. Wide on purpose: this does not judge a
 * mosque's choices, only whether what arrived is a prayer timetable at all.
 */
export const WINDOW: Record<PrayerKey, [number, number]> = {
  fajr: [2 * 60 + 30, 8 * 60 + 15],
  dhuhr: [11 * 60 + 30, 15 * 60],
  asr: [13 * 60 + 30, 19 * 60 + 45],
  maghrib: [16 * 60, 22 * 60 + 45],
  isha: [17 * 60 + 30, 23 * 60 + 59],
};

/** How sure a reading is, best first. Which of two readings of one page wins rests on this. */
const LABELLED = 3;
const HEADED = 2;
const GUESSED = 1;
const HOW: Record<number, Confidence> = { 3: "labelled", 2: "headed", 1: "guessed" };

type Kind = "time" | "single" | "computed";

// --- recognising the pieces --------------------------------------------------
const APOS = "['\u2019`]?";
const NAMES: Record<PrayerKey, string> = {
  fajr: "fajr|fajar|fajir|fadjr|subh|sobh",
  dhuhr: "dhuhr|dhur|duhr|duhur|zuhr|zohr|zuhur|dhohr|zhuhr|dhuhur|dohr|thuhr|zuhar|zohar|dhuhar|duhar",
  asr: `asr|asar|${APOS}asr`,
  maghrib: "maghrib|magrib|maghreb|magreb|mughrib|mughreb|maghrb|maghib|magharib",
  isha: `isha${APOS}a|isha|ishaa|esha|eshaa|ish\u00e1`,
};

/** A word, not part of one: whatever comes before is not a letter and neither is what follows. */
function word(pattern: string): RegExp {
  return new RegExp(`(^|[^a-z])(${pattern})(?![a-z])`, "gi");
}

const NAME_RE = Object.fromEntries(PRAYER_KEYS.map((p) => [p, word(NAMES[p])])) as Record<PrayerKey, RegExp>;

// Rows that are not one of the five and end whatever came before them.
const BOUNDARY_RE = word(
  "sunrise|sun rise|shuruq|shurooq|shurouq|shuruk|chourouk|imsak|" +
    "ju+m+[u`\u2019\u02bf']*a+[`\u2019']?a*h?|khut?b[aeh]{1,3}|khotb[ae]h?|" +
    "friday|fri|eid|taraweeh|tarawih|tahajjud|ishraq|duha|zawal|qiyam|sehri|suhoor|iftar"
);
// "Sunset | 7:18 PM" as a row of its own in a timetable is a row that is not one of the
// five, like Sunrise. "Maghrib: Sunset" is Maghrib's own answer, and is not.
const SUNSET_ROW = /^[\s|]*sun\s?set(?![a-z])/i;
const IQAMA_RE = word(
  `iq[a\u0101]{1,2}m[a\u0101]?h?t?|jam[a\u0101]{1,2}[\u02bf']?[a\u0101]?t|jam[a\u0101]?${APOS}?ah|jam[a\u0101]{1,2}h|congregation`
);
const ADHAN_RE = word("a[dt]h[a\u0101]{1,2}n|azaan|azan|adan|begins?|starts?|beginning|call to prayer");
const TIME_RE = /(\d{1,2}):(\d{2})(?![\d:])(?:\s*([ap])\.?\s?m\b\.?)?/gi;

/** [hour, minute, "a" | "p" | null] */
type Clock = [number, number, "a" | "p" | null];

interface Tok {
  kind: "name" | "bound" | "label" | "time";
  line: number;
  pos: number;
  name?: PrayerKey;
  label?: "iqama" | "adhan";
  clock?: Clock;
}

function* matches(re: RegExp, text: string): Generator<RegExpExecArray> {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) re.lastIndex += 1;
    yield m;
  }
}

/** Every recognised piece of every line, in reading order. */
function tokenize(lines: string[]): Tok[] {
  const out: Tok[] = [];
  lines.forEach((text, line) => {
    const found: Tok[] = [];
    for (const prayer of PRAYER_KEYS) {
      for (const m of matches(NAME_RE[prayer], text)) found.push({ kind: "name", line, pos: m.index + m[1].length, name: prayer });
    }
    for (const m of matches(BOUNDARY_RE, text)) found.push({ kind: "bound", line, pos: m.index + m[1].length });
    if (SUNSET_ROW.test(text) && hasTime(text)) found.push({ kind: "bound", line, pos: 0 });
    for (const m of matches(IQAMA_RE, text)) found.push({ kind: "label", line, pos: m.index + m[1].length, label: "iqama" });
    for (const m of matches(ADHAN_RE, text)) found.push({ kind: "label", line, pos: m.index + m[1].length, label: "adhan" });
    for (const [pos, clock] of clockTimes(text)) found.push({ kind: "time", line, pos, clock });
    found.sort((a, b) => a.pos - b.pos);
    out.push(...found);
  });
  return out;
}

/** The times on a line: "6:15", "6:15 pm", "18:30". Not part of a longer number. */
function clockTimes(text: string): Array<[number, Clock]> {
  const out: Array<[number, Clock]> = [];
  TIME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_RE.exec(text)) !== null) {
    const before = text[m.index - 1];
    const twoBefore = text[m.index - 2];
    // Not the tail of a longer number, a decimal, or the minutes of 12:30:45.
    if (before !== undefined && (/[\d.]/.test(before) || (before === ":" && twoBefore !== undefined && /\d/.test(twoBefore)))) {
      TIME_RE.lastIndex = m.index + 1;
      continue;
    }
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (minute > 59 || hour > 24) continue;
    const marker = m[3] ? (m[3].toLowerCase() as "a" | "p") : null;
    out.push([m.index, [hour, minute, marker]]);
  }
  return out;
}

function hasTime(text: string): boolean {
  return clockTimes(text).length > 0;
}

/**
 * A time as minutes after midnight, on the prayer's own clock, or null.
 *
 * A page that writes "6:15" without am or pm is common, and each prayer has
 * only one reading that lands in its window, so that decides it.
 */
function minutesOn(value: Clock, prayer: PrayerKey): number | null {
  let [hour, minute] = value;
  const marker = value[2];
  if (marker === "p") hour = (hour % 12) + 12;
  else if (marker === "a") hour = hour % 12;
  const total = hour * 60 + minute;
  const [low, high] = WINDOW[prayer];
  if (marker === null) {
    for (const guess of [total, total + 12 * 60]) if (guess >= low && guess <= high) return guess;
    return null;
  }
  return total >= low && total <= high ? total : null;
}

// --- finding a block of five prayers ------------------------------------------
const NEAR = 16; // lines from one prayer's name to the next
const SPAN = 6; // lines a prayer's own times can be spread over
const HEADER = 6; // lines above the first name that can hold column headings
const HEADING_CHARS = 40; // a line longer than this is prose, not a column heading

/**
 * Runs of the five prayers' names, in order, with no other prayer between.
 *
 * "No other prayer between" is what picks the table over a "Next prayer: FAJR"
 * strip above it: the strip's Fajr has the table's Fajr after it, so it is not
 * followed directly by Dhuhr.
 */
function chains(tokens: Tok[]): number[][] {
  const seq: number[] = [];
  tokens.forEach((t, i) => {
    if (t.kind !== "name") return;
    const last = seq.length ? tokens[seq[seq.length - 1]] : null;
    // A prayer written twice in a row ("Dhuhr / Zuhr") is one row.
    if (last && last.name === t.name && t.line - last.line <= 1) return;
    seq.push(i);
  });
  const found: number[][] = [];
  for (let k = 0; k + 4 < seq.length; k++) {
    const run = seq.slice(k, k + 5);
    if (!run.every((index, at) => tokens[index].name === PRAYER_KEYS[at])) continue;
    if (run.slice(1).every((b, at) => tokens[b].line - tokens[run[at]].line <= NEAR)) found.push(run);
  }
  return found;
}

/** The labels and times that belong to the prayer named at tokens[index]. */
function group(tokens: Tok[], index: number, stop: number): Tok[] {
  const name = tokens[index];
  const items: Tok[] = [];
  for (let j = index + 1; j < stop; j++) {
    const t = tokens[j];
    if (t.line - name.line > SPAN || t.kind === "name" || t.kind === "bound") break;
    items.push(t);
  }
  return items;
}

/** The words that follow one prayer's name, up to the next one. */
function groupText(lines: string[], tokens: Tok[], index: number, stop: number): string {
  const name = tokens[index];
  const endLine = stop < tokens.length ? tokens[stop].line : Math.min(lines.length - 1, name.line + SPAN);
  const endPos = stop < tokens.length ? tokens[stop].pos : null;
  const pieces: string[] = [];
  for (let n = name.line; n <= Math.min(endLine, name.line + SPAN); n++) {
    const text = lines[n];
    const start = n === name.line ? name.pos : 0;
    const stopAt = n === endLine && endPos !== null ? endPos : text.length;
    pieces.push(text.slice(start, stopAt));
  }
  return pieces.join(" ");
}

/**
 * Column labels sitting directly above the first prayer, in reading order.
 *
 * Walked back from the name over labels only: the first time, prayer name or
 * unrelated row stops it. That keeps a strip's "IQAMAH" further up the page from
 * being counted as one of this table's columns.
 *
 * Two labels are one column only when they share a cell: "Athan / Adhan" is one
 * heading said twice, "Begins | Adhan | Iqamah" is three.
 *
 * A heading is short. A sentence that happens to contain "Iqamah" -- "Confirm
 * that the Iqamah appears in your calendars" -- is not one, and counting it made
 * the first time in every row look like the iqama.
 */
function headers(tokens: Tok[], lines: string[], first: number): Array<"iqama" | "adhan"> {
  const name = tokens[first];
  const run: Tok[] = [];
  for (let i = first - 1; i >= 0; i--) {
    const t = tokens[i];
    if (name.line - t.line > HEADER || t.kind === "time" || t.kind === "name" || t.kind === "bound") break;
    if (t.kind === "label" && lines[t.line].length <= HEADING_CHARS) run.push(t);
  }
  run.reverse();
  const out: Array<"iqama" | "adhan"> = [];
  let previous: Tok | null = null;
  for (const t of run) {
    const sameCell =
      previous !== null &&
      previous.line === t.line &&
      !lines[t.line].slice(previous.pos, t.pos).includes("|") &&
      previous.label === t.label;
    if (!sameCell) out.push(t.label!);
    previous = t;
  }
  return out;
}

const roundTimes = (times: number[]): number => times.filter((m) => m % 5 === 0).length;

interface Found {
  iqama: number;
  adhan: number | null;
  quality: number;
  kind: Kind;
}

/**
 * The iqama, adhan, how sure, and kind for one prayer, or null.
 *
 * kind is "time" for one read off the page, "single" for a lone unlabelled time
 * (accepted only if the block as a whole looks human-set) and "computed" for
 * Maghrib worked out from the sun.
 */
function iqamaOf(items: Tok[], header: Array<"iqama" | "adhan">, prayer: PrayerKey, words: string, sun: Sun | null): Found | null {
  const times: Array<{ clock: Clock; label: "iqama" | "adhan" | null }> = [];
  let label: "iqama" | "adhan" | null = null;
  for (const t of items) {
    if (t.kind === "label") label = t.label!;
    else if (t.kind === "time") {
      times.push({ clock: t.clock!, label });
      label = null;
    }
  }
  const mins = (raw: Clock | undefined): number | null => (raw ? minutesOn(raw, prayer) : null);

  if (times.length === 0) {
    if (prayer === "maghrib" && sun !== null) {
      const value = maghribFromWords(words, sun.sunset);
      if (value !== null) return { iqama: value, adhan: null, quality: LABELLED, kind: "computed" };
    }
    return null;
  }

  const labelled = times.filter((t) => t.label);
  const iq = labelled.find((t) => t.label === "iqama")?.clock;
  let ad = labelled.find((t) => t.label === "adhan")?.clock;
  const plain = times.map((t) => t.clock);

  if (iq !== undefined) {
    // "Iqama: 6:00 AM"
    if (ad === undefined && times.length === 2) ad = times.find((t) => t.label === null)?.clock;
    const got = mins(iq);
    return got !== null ? { iqama: got, adhan: mins(ad), quality: LABELLED, kind: "time" } : null;
  }
  if (ad !== undefined && times.length === 2) {
    // "6:15 AM  ATHAN: 05:41"
    const other = times.find((t) => t.label === null)?.clock;
    if (other !== undefined && mins(other) !== null) return { iqama: mins(other)!, adhan: mins(ad), quality: LABELLED, kind: "time" };
  }
  if (header.length && header.includes("iqama") && plain.length === header.length) {
    // a table's own columns
    const got = mins(plain[header.indexOf("iqama")]);
    // Of several adhan-like columns ("Begins", "Adhan") the last is the call.
    const at = header.includes("adhan") ? header.length - 1 - [...header].reverse().indexOf("adhan") : null;
    const adhan = at !== null ? mins(plain[at]) : null;
    return got !== null ? { iqama: got, adhan, quality: HEADED, kind: "time" } : null;
  }
  if (header.length === 1 && header[0] === "adhan" && plain.length === 2) {
    // only "Athan" is named
    const first = mins(plain[0]);
    const second = mins(plain[1]);
    if (first !== null && second !== null && second - first >= 0 && second - first <= 90) {
      return { iqama: second, adhan: first, quality: GUESSED, kind: "time" };
    }
    return null;
  }
  if (header.length === 0 && plain.length === 2) {
    // two times, nothing says which
    const first = mins(plain[0]);
    const second = mins(plain[1]);
    if (first !== null && second !== null && second - first >= 0 && second - first <= 90) {
      return { iqama: second, adhan: first, quality: GUESSED, kind: "time" };
    }
    return null;
  }
  if (header.length === 0 && labelled.length === 0 && plain.length === 1) {
    // one time, nothing says what
    const got = mins(plain[0]);
    return got !== null ? { iqama: got, adhan: null, quality: GUESSED, kind: "single" } : null;
  }
  return null;
}

/**
 * The quality of a reading that passes every check, or null.
 *
 * The checks are the same for every layout, which is the point of keeping them
 * here: however the page was laid out, what comes out has to be a timetable a
 * mosque could actually have.
 */
function accept(
  result: MinutesByPrayer,
  adhans: Partial<MinutesByPrayer>,
  kinds: Record<PrayerKey, Kind>,
  worstIn: number,
  sun: Sun | null
): number | null {
  let worst = worstIn;
  const run = PRAYER_KEYS.map((p) => result[p]);
  for (let i = 0; i + 1 < run.length; i++) if (run[i] >= run[i + 1]) return null; // out of order
  for (const prayer of PRAYER_KEYS) {
    const adhan = adhans[prayer];
    if (adhan === undefined) continue;
    const gap = result[prayer] - adhan;
    // An iqama before its adhan is a misread column. Maghrib may share the minute;
    // the rest are at most a little over an hour on.
    if (gap < 0 || gap > 90 || (gap === 0 && prayer !== "maghrib")) return null;
  }

  // One time apiece and no label: only if a person plainly chose them.
  const singles = PRAYER_KEYS.filter((p) => kinds[p] === "single");
  if (singles.length) {
    if (PRAYER_KEYS.some((p) => kinds[p] === "time")) return null; // a mix says the page is not uniform
    // Maghrib is prayed at sunset, which is no round number; a page that lists the other
    // four by a person's hand and Maghrib by the sun is the ordinary way to write it down.
    const explicit = singles.filter((p) => p !== "maghrib").map((p) => result[p]);
    if (explicit.length < 4 || roundTimes(explicit) < explicit.length) return null;
    worst = GUESSED;
  }

  // A table of round adhan times is a template still waiting for its numbers.
  const adhanValues = Object.values(adhans) as number[];
  if (adhanValues.length >= 4 && adhanValues.every((a) => a % 30 === 0)) return null;

  if (sun !== null && checkAgainstSun(result, sun)) return null; // the wrong season, or a placeholder
  return worst;
}

interface Block {
  minutes: MinutesByPrayer;
  quality: number;
  kinds: Record<PrayerKey, Kind>;
  lines: [number, number];
  today: boolean;
}

/**
 * Whether the block is introduced as today's: "Today", "Today's prayer times".
 *
 * A weekly calendar prints seven days' times one after another, and the only
 * thing that says which is today's is a word like this above it.
 */
function saysToday(lines: string[], first: number): boolean {
  return /\b(?:today|current(?:ly)?)\b/i.test(lines.slice(Math.max(0, first - 4), first + 1).join(" "));
}

/** One candidate: five prayers' iqamas, or null if they do not add up. */
function readBlock(tokens: Tok[], lines: string[], run: number[], sun: Sun | null): Block | null {
  const header = headers(tokens, lines, run[0]);
  const result = {} as MinutesByPrayer;
  const kinds = {} as Record<PrayerKey, Kind>;
  const adhans: Partial<MinutesByPrayer> = {};
  let worst = LABELLED;
  for (let k = 0; k < PRAYER_KEYS.length; k++) {
    const prayer = PRAYER_KEYS[k];
    const stop = k + 1 < run.length ? run[k + 1] : tokens.length;
    const found = iqamaOf(group(tokens, run[k], stop), header, prayer, groupText(lines, tokens, run[k], stop), sun);
    if (found === null) return null;
    result[prayer] = found.iqama;
    kinds[prayer] = found.kind;
    if (found.adhan !== null) adhans[prayer] = found.adhan;
    worst = Math.min(worst, found.quality);
  }
  const quality = accept(result, adhans, kinds, worst, sun);
  if (quality === null) return null;
  return {
    minutes: result,
    quality,
    kinds,
    lines: [tokens[run[0]].line, tokens[run[run.length - 1]].line],
    today: saysToday(lines, tokens[run[0]].line),
  };
}

/**
 * Prayers across the top, one row of times per kind beneath.
 *
 *     |       | Fajr     | Dhuhr    | Asr      | Maghrib  | Isha     |
 *     | Adhan | 05:51 AM | 01:15 PM | 04:40 PM | 07:25 PM | 08:43 PM |
 *     | Iqama | 06:15 AM | 01:45 PM | 06:00 PM | 07:30 PM | 09:00 PM |
 *
 * The transpose of the layout everything else here reads, and as common: a
 * timetable narrow enough for a phone is drawn this way.
 */
function readHorizontal(tokens: Tok[], lines: string[], run: number[], sun: Sun | null): Block | null {
  const head = tokens[run[0]].line;
  const firstPos = tokens[run[0]].pos;
  const lastPos = tokens[run[run.length - 1]].pos;
  const columns = tokens.filter((t) => t.line === head && (t.kind === "name" || t.kind === "bound") && firstPos <= t.pos && t.pos <= lastPos);
  const prayerAt = columns.map((t, i) => (t.kind === "name" ? i : -1)).filter((i) => i >= 0);
  const rows = new Map<string | null, [number, Tok[]]>();
  for (let n = head + 1; n < Math.min(lines.length, head + 9); n++) {
    const row = tokens.filter((t) => t.line === n);
    if (row.some((t) => t.kind === "name" || t.kind === "bound")) break; // the next section
    const times = row.filter((t) => t.kind === "time");
    if (times.length !== 5 && times.length !== columns.length) continue;
    const label = row.find((t) => t.kind === "label" && t.pos < times[0].pos)?.label ?? null;
    const picked = times.length === columns.length ? prayerAt.map((i) => times[i]) : times;
    if (!rows.has(label)) rows.set(label, [n, picked]);
  }
  const iqamaRow = rows.get("iqama");
  if (!iqamaRow || iqamaRow[1].length < PRAYER_KEYS.length) return null;
  const result = {} as MinutesByPrayer;
  for (let k = 0; k < PRAYER_KEYS.length; k++) {
    const minutes = minutesOn(iqamaRow[1][k].clock!, PRAYER_KEYS[k]);
    if (minutes === null) return null;
    result[PRAYER_KEYS[k]] = minutes;
  }
  const adhans: Partial<MinutesByPrayer> = {};
  const adhanRow = rows.get("adhan");
  if (adhanRow && adhanRow[1].length >= PRAYER_KEYS.length) {
    for (let k = 0; k < PRAYER_KEYS.length; k++) {
      const adhan = minutesOn(adhanRow[1][k].clock!, PRAYER_KEYS[k]);
      if (adhan !== null) adhans[PRAYER_KEYS[k]] = adhan;
    }
  }
  const kinds = Object.fromEntries(PRAYER_KEYS.map((p) => [p, "time"])) as Record<PrayerKey, Kind>;
  const quality = accept(result, adhans, kinds, LABELLED, sun);
  if (quality === null) return null;
  const last = Math.max(...[...rows.values()].map(([n]) => n));
  return { minutes: result, quality, kinds, lines: [head, last], today: saysToday(lines, head) };
}

/**
 * All five names first, then their times in the same order.
 *
 *     Fajr / Dhuhr / Asr / Maghrib / Isha                one name to a line
 *     6:15 AM / 1:30 PM / 5:30 PM / Sunset / 9:15 PM     then one time to a line
 *
 * What a widget laid out in columns comes to once it is flattened. One list of
 * times is the iqamas if it says so or if nothing says otherwise (and then it
 * must look chosen by a person); two lists -- begins, then iqama -- are taken
 * only when each is named just above it, or the page names its columns.
 */
function readColumns(tokens: Tok[], lines: string[], run: number[], sun: Sun | null): Block | null {
  if (tokens.slice(run[0], run[run.length - 1] + 1).some((t) => t.kind === "time")) return null; // times between the names: not this layout
  const first = tokens[run[0]].line;
  const last = tokens[run[run.length - 1]].line;
  const byLine = new Map<number, Tok[]>();
  for (const t of tokens) {
    if (t.line >= first && t.line <= last + 24) {
      const row = byLine.get(t.line);
      if (row) row.push(t);
      else byLine.set(t.line, [t]);
    }
  }

  type Entry = { kind: "time"; clock: Clock } | { kind: "computed"; minutes: number };
  const entry = (n: number, k: number): Entry | null => {
    if (n >= lines.length) return null;
    const row = byLine.get(n) ?? [];
    if (row.some((t) => t.kind === "name" || t.kind === "bound")) return null;
    const times = row.filter((t) => t.kind === "time");
    if (times.length === 1) return { kind: "time", clock: times[0].clock! };
    if (times.length === 0 && k === 3 && sun !== null) {
      const got = maghribFromWords(lines[n], sun.sunset);
      if (got !== null) return { kind: "computed", minutes: got };
    }
    return null;
  };
  const readList = (start: number): Entry[] | null => {
    const got: Entry[] = [];
    for (let k = 0; k < 5; k++) {
      const e = entry(start + k, k);
      if (e === null) return null;
      got.push(e);
    }
    return got;
  };
  const labelOf = (n: number): "iqama" | "adhan" | null => {
    const row = byLine.get(n) ?? [];
    if (row.length && !row.some((t) => t.kind === "time" || t.kind === "name" || t.kind === "bound")) {
      return row.find((t) => t.kind === "label")?.label ?? null;
    }
    return null;
  };

  const lists: Entry[][] = [];
  const labels: Array<"iqama" | "adhan" | null> = [];
  let n = last + 1;
  let skipped = 0;
  while (lists.length < 2 && n <= last + 24) {
    const label = labelOf(n);
    const start = label !== null ? n + 1 : n;
    const got = readList(start);
    if (got !== null) {
      lists.push(got);
      labels.push(label);
      n = start + 5;
    } else if (lists.length > 0 || skipped >= 2) {
      break;
    } else {
      skipped += 1; // a caption between the names and the times
      n += 1;
    }
  }
  if (lists.length === 0) return null;

  const head = headers(tokens, lines, run[0]);
  let chosen: Entry[];
  let adhanList: Entry[] | null;
  let quality: number;
  if (lists.length === 2) {
    const named: Array<"iqama" | "adhan" | null> | null = labels.every((l) => l !== null) ? labels : head.length === 2 ? head : null;
    if (!named || !named.includes("iqama")) return null;
    const pick = named.indexOf("iqama");
    chosen = lists[pick];
    adhanList = lists[1 - pick];
    quality = labels.every((l) => l !== null) ? LABELLED : HEADED;
  } else {
    chosen = lists[0];
    adhanList = null;
    if (labels[0] === "adhan") return null; // only the call to prayer is printed
    quality = labels[0] === "iqama" ? LABELLED : GUESSED;
  }

  const result = {} as MinutesByPrayer;
  const kinds = {} as Record<PrayerKey, Kind>;
  const adhans: Partial<MinutesByPrayer> = {};
  for (let k = 0; k < PRAYER_KEYS.length; k++) {
    const prayer = PRAYER_KEYS[k];
    const item = chosen[k];
    const minutes = item.kind === "computed" ? item.minutes : minutesOn(item.clock, prayer);
    if (minutes === null) return null;
    result[prayer] = minutes;
    kinds[prayer] = item.kind === "computed" ? "computed" : quality === GUESSED ? "single" : "time";
    const other = adhanList?.[k];
    if (other && other.kind === "time") {
      const a = minutesOn(other.clock, prayer);
      if (a !== null) adhans[prayer] = a;
    }
  }
  const worst = accept(result, adhans, kinds, quality, sun);
  if (worst === null) return null;
  return { minutes: result, quality: worst, kinds, lines: [first, n - 1], today: saysToday(lines, first) };
}

/** Every run of the five prayers on the page that reads as iqama times. */
function blocks(lines: string[], sun: Sun | null): Block[] {
  const tokens = tokenize(lines);
  const found: Block[] = [];
  for (const run of chains(tokens)) {
    const across = tokens[run[run.length - 1]].line - tokens[run[0]].line <= 1;
    let block = across ? readHorizontal(tokens, lines, run, sun) : readBlock(tokens, lines, run, sun);
    if (block === null && !across) block = readColumns(tokens, lines, run, sun);
    if (block) found.push(block);
  }
  return found;
}

// --- what days the page says these times are for -----------------------------------
const MONTH_NAMES = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const monthOf = (name: string): number => MONTH_NAMES.indexOf(name.slice(0, 3).toLowerCase()) + 1;
const MON = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const ORD = "(?:st|nd|rd|th)?";
const TO = "\\s*(?:to|-|\u2013|\u2014|through|thru)\\s*";
// The (?![\d:]) matters: without it "September 2026" reads as September 20, which on the
// 20th makes every day of a calendar headed by its month look like today, and
// "21 September 5:30 AM" reads as September 5.
const RANGE_MD = new RegExp(`${MON}\\s+(\\d{1,2})${ORD}${TO}(?:${MON}\\s+)?(\\d{1,2})(?![\\d:])${ORD}`, "gi");
const RANGE_DM = new RegExp(`(\\d{1,2})${ORD}${TO}(\\d{1,2})${ORD}\\s+${MON}`, "gi");
const DATE_MD = new RegExp(`${MON}\\s+(\\d{1,2})(?![\\d:])${ORD}(?:,?\\s+(\\d{4}))?`, "gi");
const DATE_DM = new RegExp(`(\\d{1,2})${ORD}\\s+${MON}(?:,?\\s+(\\d{4}))?`, "gi");
const ISO = /(20\d\d)-(\d{2})-(\d{2})(?!\d)/g;

// The words in front of a date that say what it is a date of. "Salah timings from
// September 13th" is in force from then until it is changed; "times change on
// Monday 21 September" is in force until then; a bare "Thursday, Sep 17" heads the
// times of that one day.
const FROM_CUE = /\b(?:from|effective|starting|starts?|since|as of|updated|w\.?e\.?f\.?|begin(?:s|ning)?)\b[^.\d]{0,24}$/i;
const UNTIL_CUE = /\b(?:until|till|through|thru|(?:next|upcoming)(?: time)? changes?|changes?|ends?|expires?)\b[^.\d]{0,24}$/i;
const ANY_CUE = /\b(?:from|effective|starting|since|as of|updated|until|till|through|changes?|w\.?e\.?f)\b/i;
const DATE_LINE_CHARS = 80; // a longer sentence is prose, and its date is not this table's
const FROM_VALID_DAYS = 200; // "from March 8" is not a reason to trust a September page

type Where_ = "above" | "inside" | "below";
interface DateEvidence {
  kind: "day" | "range" | "from" | "until";
  start: Ymd;
  end: Ymd;
  where: Where_;
}

/** The date with that month and day nearest to today: a page rarely prints the year. */
function closest(month: number, day: number, today: Ymd): Ymd | null {
  let best: Ymd | null = null;
  for (const year of [today.year - 1, today.year, today.year + 1]) {
    if (!isValidYmd(year, month, day)) continue;
    const d = { year, month, day };
    if (best === null || Math.abs(daysBetween(today, d)) < Math.abs(daysBetween(today, best))) best = d;
  }
  return best;
}

function lineDates(text: string, where: Where_, today: Ymd): DateEvidence[] {
  if (text.length > 120 || (text.length > DATE_LINE_CHARS && !ANY_CUE.test(text))) return [];
  const out: DateEvidence[] = [];
  const masked = text.split("");
  const blank = (start: number, end: number): void => {
    for (let i = start; i < end; i++) masked[i] = " ";
  };
  const kindOf = (start: number): "day" | "from" | "until" => {
    const prefix = text.slice(Math.max(0, start - 40), start);
    if (UNTIL_CUE.test(prefix)) return "until";
    return FROM_CUE.test(prefix) ? "from" : "day";
  };

  for (const m of matches(new RegExp(RANGE_MD.source, "gi"), text)) {
    const m1 = monthOf(m[1]);
    const m2 = m[3] ? monthOf(m[3]) : m1;
    const start = closest(m1, Number(m[2]), today);
    if (!start || !isValidYmd(start.year, m2, Number(m[4]))) continue;
    let end: Ymd = { year: start.year, month: m2, day: Number(m[4]) };
    if (dayNumber(end) < dayNumber(start)) end = { year: end.year + 1, month: end.month, day: end.day };
    out.push({ kind: "range", start, end, where });
    blank(m.index, m.index + m[0].length);
  }
  for (const m of matches(new RegExp(RANGE_DM.source, "gi"), masked.join(""))) {
    const m1 = monthOf(m[3]);
    const start = closest(m1, Number(m[1]), today);
    if (start && isValidYmd(start.year, m1, Number(m[2]))) {
      out.push({ kind: "range", start, end: { year: start.year, month: m1, day: Number(m[2]) }, where });
      blank(m.index, m.index + m[0].length);
    }
  }
  for (const m of matches(new RegExp(ISO.source, "g"), masked.join(""))) {
    const before = masked[m.index - 1];
    if (before !== undefined && /\d/.test(before)) continue;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (isValidYmd(y, mo, d)) {
      out.push({ kind: kindOf(m.index), start: { year: y, month: mo, day: d }, end: { year: y, month: mo, day: d }, where });
      blank(m.index, m.index + m[0].length);
    }
  }
  const singles: Array<[RegExp, number, number, number]> = [
    [DATE_DM, 2, 1, 3],
    [DATE_MD, 1, 2, 3],
  ];
  for (const [rx, mon, day, year] of singles) {
    for (const m of matches(new RegExp(rx.source, "gi"), masked.join(""))) {
      const month = monthOf(m[mon]);
      const d = m[year]
        ? isValidYmd(Number(m[year]), month, Number(m[day]))
          ? { year: Number(m[year]), month, day: Number(m[day]) }
          : null
        : closest(month, Number(m[day]), today);
      if (d) {
        out.push({ kind: kindOf(m.index), start: d, end: d, where });
        blank(m.index, m.index + m[0].length);
      }
    }
  }
  return out;
}

/**
 * What the page says about which days the block at lines first..last is for.
 *
 * Above it, and on its own lines, a date heads the block. Below it, a date as
 * likely heads the next block, so only a "changes on" says anything there.
 */
function datesNear(lines: string[], first: number, last: number, today: Ymd): DateEvidence[] {
  const found: DateEvidence[] = [];
  const spans: Array<[number, number, Where_]> = [
    [Math.max(0, first - 5), first, "above"],
    [first, last + 1, "inside"],
    [last + 1, last + 4, "below"],
  ];
  for (const [lo, hi, where] of spans) {
    for (let n = lo; n < Math.min(hi, lines.length); n++) found.push(...lineDates(lines[n], where, today));
  }
  return found;
}

/**
 * Whether the page says these are today's times, and whether it says so to the day.
 *
 * verdict is true when something says they are, false when something says they
 * are not, and null when nothing says -- or when two things disagree. `exact` is
 * whether a date printed is today's to the day: a page's yesterday and tomorrow
 * are near enough to be believed on their own, and no use for choosing between
 * the days of a week.
 */
function freshness(evidence: DateEvidence[], today: Ymd): { verdict: boolean | null; exact: boolean } {
  let good = false;
  let bad = false;
  let exact = false;
  for (const { kind, start, end, where } of evidence) {
    let ok: boolean;
    if (kind === "until") {
      const left = daysBetween(today, start);
      if (left > 60) continue; // too far off to say anything
      ok = left >= -1;
    } else if (where === "below") {
      continue; // heads the next block as often as this one
    } else if (kind === "range") {
      ok = dayNumber(start) - 1 <= dayNumber(today) && dayNumber(today) <= dayNumber(end) + 1;
      exact = exact || (dayNumber(start) <= dayNumber(today) && dayNumber(today) <= dayNumber(end));
    } else if (kind === "from") {
      const age = daysBetween(start, today);
      ok = age >= 0 && age <= FROM_VALID_DAYS;
    } else {
      ok = Math.abs(daysBetween(today, start)) <= 1;
      exact = exact || sameDay(start, today);
    }
    good = good || ok;
    bad = bad || !ok;
  }
  return { verdict: good !== bad ? good : null, exact: exact && good && !bad };
}

// --- the whole of one page ------------------------------------------------------------

export interface PageReading {
  /** Five iqamas, "HH:mm". */
  times: Record<PrayerKey, string>;
  minutes: MinutesByPrayer;
  how: Confidence;
  /** 1 guessed .. 3 labelled: which of two readings of one page wins. */
  quality: number;
  /** Prayers worked out from the sun rather than read. */
  computed: PrayerKey[];
  /** Maghrib as the page states it, "sunset+5", when it is worked out from the sun. */
  maghribRule?: string;
  /** Whether the sun was there to check against. */
  sunChecked: boolean;
  /** When the page says the times change, if it does, "YYYY-MM-DD". */
  validUntil?: string;
}

export interface ExtractOptions {
  /** The day on the mosque's own wall. */
  today: Ymd;
  /** Where the mosque is, when known; without it the sun-based checks are skipped. */
  where?: Where | null;
}

/**
 * The iqama times on one page, or null. Never a guess dressed as a reading.
 *
 * Without a position, the page's own coordinates are used if it has any; without
 * either, the sun-based checks are skipped and Maghrib written as "sunset" cannot
 * be read.
 */
export function extractIqama(html: string, options: ExtractOptions): PageReading | null {
  const { today } = options;
  const where: Where | null = options.where ?? findCoordinates(html);
  const sun = where ? sunToday(where, today) : null;
  const lines = flatten(html);
  const candidates = blocks(lines, sun);
  if (candidates.length === 0) return null;

  interface Usable {
    quality: number;
    proof: number;
    block: Block;
    evidence: DateEvidence[];
  }
  let usable: Usable[] = [];
  for (const block of candidates) {
    const evidence = datesNear(lines, block.lines[0], block.lines[1], today);
    const { verdict, exact } = freshness(evidence, today);
    if (verdict === false && !block.today) continue; // dated, and not today
    // 2: it says today, to the day. 1: what it says is consistent with today.
    const proof = block.today || exact ? 2 : verdict === true ? 1 : 0;
    usable.push({ quality: block.quality, proof, block, evidence });
  }
  if (usable.length === 0) return null;

  const setOf = (u: Usable): string => PRAYER_KEYS.map((p) => u.block.minutes[p]).join(",");
  if (new Set(usable.map(setOf)).size > 1) {
    // Several different sets of times on one page -- a week's calendar, a men's and a women's
    // hall, two branches. Quality is no way to choose between them: the wrong column can look
    // better than the right row, and did. Only evidence that one is today's settles it, and
    // the best evidence must point at one set alone.
    const strongest = Math.max(...usable.map((u) => u.proof));
    usable = strongest > 0 ? usable.filter((u) => u.proof === strongest) : [];
    if (new Set(usable.map(setOf)).size !== 1) return null;
  }
  const best = Math.max(...usable.map((u) => u.quality));
  const chosen = usable.find((u) => u.quality === best)!;
  const block = chosen.block;

  // When the page says these change, if it does: the nearest "changes on" still to come.
  let until: Ymd | null = null;
  for (const e of chosen.evidence) {
    if (e.kind !== "until") continue;
    const left = daysBetween(today, e.start);
    if (left < 0 || left > 60) continue;
    if (until === null || dayNumber(e.start) < dayNumber(until)) until = e.start;
  }
  const validUntil = until ? isoDate(until) : undefined;

  const times = Object.fromEntries(PRAYER_KEYS.map((p) => [p, hhmm(block.minutes[p])])) as Record<PrayerKey, string>;
  // A Maghrib that came from words such as "Sunset + 5" is only right on the day it is worked out; the rule is right all year.
  const offset = sun !== null && block.kinds.maghrib === "computed" ? Math.round(block.minutes.maghrib - sun.sunset) : -1;
  const maghribRule = offset === 0 ? "sunset" : offset > 0 ? `sunset+${offset}` : undefined;
  return {
    times,
    minutes: block.minutes,
    how: HOW[block.quality],
    quality: block.quality,
    computed: PRAYER_KEYS.filter((p) => block.kinds[p] === "computed"),
    ...(maghribRule ? { maghribRule } : {}),
    sunChecked: sun !== null,
    ...(validUntil ? { validUntil } : {}),
  };
}

