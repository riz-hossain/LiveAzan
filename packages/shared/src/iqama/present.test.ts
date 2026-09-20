import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maghribFromWords, sunToday } from "./astro";
import { hhmm, ymd } from "./clock";
import type { MosqueOutcome } from "./pipeline";
import { formatDay, headline, isCurrent, metaFromBorrowed, metaFromOutcome, notesFor, savedTimes, sourceLabel, timesFromListing, toneOf, type IqamaMeta } from "./present";
import type { IqamaReading } from "./types";

const TODAY = ymd(2026, 9, 20);
const WATERLOO = { lat: 43.4643, lon: -80.5204, utcOffsetHours: -4 };
const TIMES = { fajr: "06:15", dhuhr: "13:45", asr: "17:45", maghrib: "19:28", isha: "21:00" };

const reading = (over: Partial<IqamaReading> = {}): IqamaReading => ({
  times: TIMES,
  source: "website",
  how: "labelled",
  asOf: "2026-09-20",
  page: "https://masjid.example/times",
  computed: [],
  sunChecked: true,
  warnings: [],
  ...over,
});

const meta = (over: Partial<IqamaMeta> = {}): IqamaMeta => ({ source: "website", how: "labelled", asOf: "2026-09-20", warnings: [], ...over });

describe("what is remembered about a reading", () => {
  it("keeps where it came from, how sure, and the page", () => {
    const outcome: MosqueOutcome = { reading: reading({ corroboratedBy: "mawaqit", validUntil: "2026-10-01" }), alternatives: [], problems: [] };
    assert.deepEqual(metaFromOutcome(outcome), {
      source: "website",
      how: "labelled",
      asOf: "2026-09-20",
      page: "https://masjid.example/times",
      warnings: [],
      corroboratedBy: "mawaqit",
      validUntil: "2026-10-01",
    });
  });

  it("keeps what disagreed, and with whom", () => {
    const outcome: MosqueOutcome = {
      reading: reading(),
      alternatives: [],
      disagreement: { prayers: ["fajr", "isha"], chosen: "website", other: "mawaqit" },
      problems: [],
    };
    assert.deepEqual(metaFromOutcome(outcome)?.disagreement, { prayers: ["fajr", "isha"], other: "mawaqit" });
  });

  it("has nothing to keep when nothing was read", () => {
    assert.equal(metaFromOutcome({ reading: null, alternatives: [], problems: ["could not reach the mosque's website"] }), null);
  });

  it("says whose times a borrowed reading is", () => {
    const got = metaFromBorrowed({ reading: reading({ source: "nearby" }), from: { name: "Masjid Bilal", latitude: 43.5, longitude: -80.5, km: 3.2 } });
    assert.equal(got.source, "nearby");
    assert.deepEqual(got.from, { name: "Masjid Bilal", km: 3.2 });
  });
});

describe("naming a source", () => {
  it("names each, and says when a page was only guessed at", () => {
    assert.equal(sourceLabel({ source: "plugin" }), "Mosque timetable");
    assert.equal(sourceLabel({ source: "website", how: "labelled" }), "Mosque website");
    assert.equal(sourceLabel({ source: "website", how: "guessed" }), "Website (unconfirmed)");
    assert.equal(sourceLabel({ source: "mawaqit" }), "MAWAQIT");
    assert.equal(sourceLabel({ source: "nearby" }), "Nearby mosque");
    assert.equal(sourceLabel({ source: "saved" }), "Saved times");
  });

  it("trusts a plain reading, is careful about a disputed one, and warns about a guess, a neighbour's and an old record", () => {
    assert.equal(toneOf(meta(), TODAY), "good");
    assert.equal(toneOf(meta({ warnings: ["Fajr at 07:05 is not possible"] }), TODAY), "fair");
    assert.equal(toneOf(meta({ disagreement: { prayers: ["fajr"], other: "mawaqit" } }), TODAY), "fair");
    assert.equal(toneOf(meta({ how: "guessed" }), TODAY), "caution");
    assert.equal(toneOf(meta({ source: "nearby" }), TODAY), "caution");
    assert.equal(toneOf(meta({ source: "saved", asOf: "2026-03-15" }), TODAY), "caution");
    assert.equal(toneOf(meta({ source: "saved", asOf: "2026-09-10" }), TODAY), "fair");
    assert.equal(toneOf(meta({ source: "saved", asOf: "" }), TODAY), "caution");
    // a reading is only as good as it is recent
    assert.equal(toneOf(meta({ asOf: "2026-09-19" }), TODAY), "fair");
    assert.equal(toneOf(meta({ asOf: "2026-09-13" }), TODAY), "fair");
    assert.equal(toneOf(meta({ asOf: "2026-09-12" }), TODAY), "caution");
  });
});

describe("whether to look again", () => {
  it("is content only with the mosque's own reading of today", () => {
    assert.equal(isCurrent(meta(), TODAY), true);
    assert.equal(isCurrent(meta({ asOf: "2026-09-19" }), TODAY), false);
    assert.equal(isCurrent(meta({ source: "saved", asOf: "2026-09-20" }), TODAY), false);
    assert.equal(isCurrent(meta({ source: "nearby" }), TODAY), false);
    assert.equal(isCurrent(null, TODAY), false);
  });
});

describe("saying it in words", () => {
  it("writes days short, with the year only when it is another one", () => {
    assert.equal(formatDay("2026-03-15", TODAY), "Mar 15");
    assert.equal(formatDay("2025-12-31", TODAY), "Dec 31, 2025");
    assert.equal(formatDay("soon", TODAY), "");
  });

  it("gives one line for a small space", () => {
    assert.equal(headline(meta({ source: "plugin", how: "exact" }), TODAY), "Mosque timetable");
    assert.equal(headline(meta({ asOf: "2026-09-18" }), TODAY), "Mosque website · times for Sep 18");
    assert.equal(headline(meta({ how: "guessed" }), TODAY), "Website (unconfirmed) · a best guess");
    assert.equal(headline(meta({ source: "saved", how: undefined, asOf: "2026-03-15" }), TODAY), "Saved times from Mar 15 · may have changed");
    assert.equal(headline(meta({ source: "saved", how: undefined, asOf: "" }), TODAY), "Saved times · age unknown");
    assert.equal(headline(meta({ source: "nearby", from: { name: "Masjid Bilal", km: 3.2 } }), TODAY), "Approximate · Masjid Bilal, 3.2 km away");
  });

  it("has nothing to add to a plain, current reading", () => {
    assert.deepEqual(notesFor(meta(), TODAY), []);
  });

  it("says saved times are old, and how old", () => {
    assert.deepEqual(notesFor(meta({ source: "saved", how: undefined, asOf: "2026-03-15" }), TODAY), ["Saved from Mar 15. Times change through the year: refresh to look for today's."]);
    assert.deepEqual(notesFor(meta({ source: "saved", how: undefined, asOf: "" }), TODAY), ["Saved times of unknown age. Refresh to look for today's."]);
  });

  it("says a neighbour's times are the neighbour's", () => {
    const notes = notesFor(meta({ source: "nearby", from: { name: "Masjid Bilal", km: 3.2 } }), TODAY);
    assert.equal(notes[0], "Approximate: these are Masjid Bilal's times, 3.2 km away. This mosque publishes none that could be read.");
  });

  it("says a page that names no column is a guess", () => {
    assert.match(notesFor(meta({ how: "guessed" }), TODAY)[0], /best guess/);
  });

  it("says who agrees and who does not", () => {
    assert.deepEqual(notesFor(meta({ corroboratedBy: "mawaqit" }), TODAY), ["Confirmed by MAWAQIT."]);
    assert.deepEqual(notesFor(meta({ corroboratedBy: "plugin" }), TODAY), ["Confirmed by the mosque's timetable."]);
    assert.deepEqual(notesFor(meta({ disagreement: { prayers: ["fajr", "isha"], other: "mawaqit" } }), TODAY), ["MAWAQIT lists different times for Fajr and Isha."]);
    assert.deepEqual(notesFor(meta({ disagreement: { prayers: ["fajr", "dhuhr", "isha"], other: "website" } }), TODAY), ["The mosque's website lists different times for Fajr, Dhuhr and Isha."]);
    // a disagreement is not also called a confirmation
    assert.deepEqual(notesFor(meta({ corroboratedBy: "mawaqit", disagreement: { prayers: ["fajr"], other: "mawaqit" } }), TODAY), ["MAWAQIT lists different times for Fajr."]);
  });

  it("says what was worked out from the sun", () => {
    assert.deepEqual(notesFor(meta({ computed: ["maghrib"] }), TODAY), ["Maghrib is worked out from the sunset time here."]);
  });

  it("passes on warnings as sentences", () => {
    assert.deepEqual(notesFor(meta({ warnings: ["the five prayers are not in order", "Fajr at 07:05 is not possible on this day here (sunrise is 06:44)"] }), TODAY), [
      "The five prayers are not in order.",
      "Fajr at 07:05 is not possible on this day here (sunrise is 06:44).",
    ]);
  });

  it("says when the times are for another day, and when the page says they change", () => {
    assert.deepEqual(notesFor(meta({ asOf: "2026-09-19", validUntil: "2026-10-01" }), TODAY), ["These are the times for Sep 19.", "The page says these change on Oct 1."]);
  });
});

describe("the research that ships with the app", () => {
  const record = { times: { fajr: "6:15", dhuhr: "13:45", asr: "17:45", isha: "21:00", jummah: "13:30" }, maghribRule: "sunset+5", researchedOn: "2026-03-15" };

  it("is shown as saved, with the day it was researched", () => {
    const got = savedTimes(record, { today: TODAY, where: WATERLOO });
    assert.ok(got);
    assert.equal(got.meta.source, "saved");
    assert.equal(got.meta.asOf, "2026-03-15");
    assert.equal(got.times.fajr, "06:15");
    assert.equal(got.jumuah, "13:30");
  });

  it("works Maghrib out for today from 'sunset+5', so it moves with the year", () => {
    const sun = sunToday(WATERLOO, TODAY)!;
    const september = savedTimes(record, { today: TODAY, where: WATERLOO })!;
    assert.equal(september.times.maghrib, hhmm(maghribFromWords("sunset+5", sun.sunset)!));
    assert.deepEqual(september.meta.computed, ["maghrib"]);
    const december = savedTimes(record, { today: ymd(2026, 12, 21), where: { ...WATERLOO, utcOffsetHours: -5 } })!;
    assert.ok(december.times.maghrib! < "17:00", december.times.maghrib);
  });

  it("does not invent a Maghrib it cannot work out", () => {
    assert.equal(savedTimes(record, { today: TODAY })!.times.maghrib, undefined);
    assert.equal(savedTimes({ ...record, maghribRule: null }, { today: TODAY, where: WATERLOO })!.times.maghrib, undefined);
  });

  it("keeps a clock time the research did record", () => {
    const got = savedTimes({ ...record, times: { ...record.times, maghrib: "19:00" } }, { today: TODAY, where: WATERLOO })!;
    assert.equal(got.times.maghrib, "19:00");
    assert.equal(got.meta.computed, undefined);
  });

  it("lets the sun object to a season it cannot be", () => {
    const summerTimes = { times: { fajr: "04:00", dhuhr: "13:45", asr: "18:15", maghrib: "21:10", isha: "22:45" }, researchedOn: "2026-06-21" };
    const got = savedTimes(summerTimes, { today: TODAY, where: WATERLOO })!;
    assert.equal(got.meta.warnings.length, 1);
    assert.match(got.meta.warnings[0], /not possible on this day here/);
    // shown all the same: it is labelled saved, and the app is looking for a fresher reading
    assert.equal(got.times.isha, "22:45");
  });

  it("has nothing to show when nothing was recorded", () => {
    assert.equal(savedTimes({ times: {} }, { today: TODAY, where: WATERLOO }), null);
    assert.equal(savedTimes({ times: { fajr: "soon" } }, { today: TODAY }), null);
  });

  it("does not know the day it was researched when the record does not say", () => {
    assert.equal(savedTimes({ times: { fajr: "06:15" } }, { today: TODAY })!.meta.asOf, "");
  });
});

describe("the times a listing came with", () => {
  const found = { fajr: "06:15", dhuhr: "13:45", asr: "17:45", maghrib: "19:28", isha: "21:00", jummah: "13:30" };

  it("are saved research unless a MAWAQIT search said them", () => {
    const got = timesFromListing({ discoveredIqama: { fajr: "6:15", dhuhr: "13:45" }, maghribRule: "sunset+5", iqamaSource: "manual", iqamaLastFetched: "2026-03-15" }, { today: TODAY, where: WATERLOO });
    assert.ok(got);
    assert.equal(got.meta.source, "saved");
    assert.equal(got.meta.asOf, "2026-03-15");
    assert.equal(got.times.fajr, "06:15");
    assert.ok(got.times.maghrib);
  });

  it("are MAWAQIT's, dated by when they were fetched, when a MAWAQIT search said them", () => {
    const got = timesFromListing({ discoveredIqama: found, iqamaSource: "mawaqit", iqamaLastFetched: "2026-09-20T13:05:00.000Z" }, { today: TODAY, where: WATERLOO });
    assert.ok(got);
    assert.equal(got.meta.source, "mawaqit");
    assert.equal(got.meta.how, "exact");
    assert.equal(got.meta.asOf, "2026-09-20");
    assert.deepEqual(got.meta.warnings, []);
    assert.equal(got.jumuah, "13:30");
    assert.equal(got.times.isha, "21:00");
  });

  it("carry the sun's objection to a MAWAQIT listing that has last winter's times", () => {
    const winter = { fajr: "04:00", dhuhr: "13:45", asr: "18:15", maghrib: "21:10", isha: "22:45" };
    const got = timesFromListing({ discoveredIqama: winter, iqamaSource: "mawaqit", iqamaLastFetched: "2026-09-20" }, { today: TODAY, where: WATERLOO });
    assert.ok(got);
    assert.ok(got.meta.warnings.length > 0);
  });

  it("do not know their day when the listing does not say", () => {
    assert.equal(timesFromListing({ discoveredIqama: found, iqamaSource: "mawaqit" }, { today: TODAY })!.meta.asOf, "");
  });

  it("are nothing when the listing carried nothing", () => {
    assert.equal(timesFromListing({}, { today: TODAY }), null);
    assert.equal(timesFromListing({ discoveredIqama: {}, iqamaSource: "mawaqit" }, { today: TODAY }), null);
  });
});
