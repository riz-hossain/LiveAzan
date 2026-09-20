import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ymd } from "./clock";
import type { MosqueOutcome } from "./pipeline";
import { updateResearch, usable, type ResearchRecord } from "./research";
import type { IqamaReading } from "./types";

const TODAY = ymd(2026, 9, 20);
const TIMES = { fajr: "06:15", dhuhr: "13:45", asr: "17:45", maghrib: "19:28", isha: "21:00" };

const reading = (over: Partial<IqamaReading> = {}): IqamaReading => ({
  times: TIMES,
  source: "website",
  how: "labelled",
  asOf: "2026-09-20",
  computed: [],
  sunChecked: true,
  warnings: [],
  ...over,
});

const outcome = (over: Partial<MosqueOutcome> = {}): MosqueOutcome => ({ reading: reading(), alternatives: [], problems: [], ...over });

describe("whether a reading is kept", () => {
  it("keeps one that could be shown to everyone without a word of caution", () => {
    const got = usable(outcome());
    assert.ok(got.ok);
    assert.deepEqual(got.reading.times, TIMES);
    assert.ok(usable(outcome({ reading: reading({ source: "plugin", how: "exact" }) })).ok);
    assert.ok(usable(outcome({ reading: reading({ how: "headed" }) })).ok);
  });

  it("does not keep a page that names no column: the phone can call that a guess, a row cannot", () => {
    const got = usable(outcome({ reading: reading({ how: "guessed" }) }));
    assert.ok(!got.ok);
    assert.match(got.why, /does not say which/);
  });

  it("does not keep a reading that raised a warning", () => {
    const got = usable(outcome({ reading: reading({ source: "mawaqit", how: "exact", warnings: ["Fajr at 07:05 is not possible on this day here"] }) }));
    assert.ok(!got.ok);
    assert.match(got.why, /Fajr at 07:05/);
  });

  it("does not keep what two sources disagree about", () => {
    const got = usable(outcome({ disagreement: { prayers: ["fajr", "isha"], chosen: "website", other: "mawaqit" } }));
    assert.ok(!got.ok);
    assert.equal(got.why, "mawaqit lists different times for fajr, isha");
  });

  it("does not keep a neighbour's times", () => {
    assert.ok(!usable(outcome({ reading: reading({ source: "nearby" }) })).ok);
  });

  it("says why when nothing was read", () => {
    const got = usable({ reading: null, alternatives: [], problems: ["could not reach the mosque's website", "that mosque is not on mawaqit.net"] });
    assert.ok(!got.ok);
    assert.equal(got.why, "could not reach the mosque's website; that mosque is not on mawaqit.net");
    const bare = usable({ reading: null, alternatives: [], problems: [] });
    assert.ok(!bare.ok && bare.why === "nothing could be read");
  });
});

describe("a reading in a mosque's research record", () => {
  const record = (): ResearchRecord => ({
    name: "A Masjid",
    website: "https://masjid.example/",
    iqamaTimes: { fajr: "05:30", dhuhr: "13:30", asr: "17:30", maghrib: "sunset+5", isha: "20:30", jummah: "13:30" },
    sources: ["google-maps"],
  });

  it("writes the five times, the day, and where they came from, and leaves the rest of the record alone", () => {
    const got = updateResearch(record(), outcome({ reading: reading({ source: "mawaqit", how: "exact" }) }), TODAY);
    assert.deepEqual(got.wrote, ["fajr", "dhuhr", "asr", "maghrib", "isha"]);
    assert.deepEqual(got.record.iqamaTimes, { ...TIMES, jummah: "13:30" });
    assert.equal(got.record.iqamaAsOf, "2026-09-20");
    assert.deepEqual(got.record.sources, ["google-maps", "mawaqit.net"]);
    assert.equal(got.record.name, "A Masjid");
    assert.equal(got.why, undefined);
  });

  it("does not change the record it was given", () => {
    const before = record();
    updateResearch(before, outcome(), TODAY);
    assert.deepEqual(before, record());
  });

  it("writes a Maghrib the page gave as a rule as that rule, not as the time it comes to today, which is wrong within a week", () => {
    const got = updateResearch(record(), outcome({ reading: reading({ computed: ["maghrib"], maghribRule: "sunset+6" }) }), TODAY);
    assert.equal(got.record.iqamaTimes!.maghrib, "sunset+6");
    assert.deepEqual(got.wrote, ["fajr", "dhuhr", "asr", "maghrib", "isha"]);
    const fresh = updateResearch({ name: "New" }, outcome({ reading: reading({ computed: ["maghrib"], maghribRule: "sunset+5" }) }), TODAY);
    assert.equal(fresh.record.iqamaTimes!.maghrib, "sunset+5");
    // a Maghrib that was a clock time on the page stays one
    assert.equal(updateResearch(record(), outcome(), TODAY).record.iqamaTimes!.maghrib, "19:28");
  });

  it("keeps a Maghrib rule the record has when the reading was worked out from the sun but has no rule to give", () => {
    const got = updateResearch(record(), outcome({ reading: reading({ computed: ["maghrib"] }) }), TODAY);
    assert.equal(got.record.iqamaTimes!.maghrib, "sunset+5");
    assert.deepEqual(got.wrote, ["fajr", "dhuhr", "asr", "isha"]);
    // with no rule recorded, the time is better than nothing
    const bare = updateResearch({ ...record(), iqamaTimes: { fajr: "05:30" } }, outcome({ reading: reading({ computed: ["maghrib"] }) }), TODAY);
    assert.equal(bare.record.iqamaTimes!.maghrib, "19:28");
  });

  it("adds Jumu'ah when the source has it, and does not remove it when the source does not", () => {
    assert.equal(updateResearch(record(), outcome({ reading: reading({ jumuah: "13:15" }) }), TODAY).record.iqamaTimes!.jummah, "13:15");
    assert.equal(updateResearch(record(), outcome(), TODAY).record.iqamaTimes!.jummah, "13:30");
  });

  it("names each source once, in the words the data files use", () => {
    const again = updateResearch({ ...record(), sources: ["website"] }, outcome(), TODAY);
    assert.deepEqual(again.record.sources, ["website"]);
    assert.deepEqual(updateResearch(record(), outcome({ reading: reading({ source: "plugin", how: "exact" }) }), TODAY).record.sources, ["google-maps", "website"]);
  });

  it("changes nothing, and says why, when the reading is not fit to keep", () => {
    const before = record();
    const got = updateResearch(before, outcome({ reading: reading({ how: "guessed" }) }), TODAY);
    assert.equal(got.record, before);
    assert.deepEqual(got.wrote, []);
    assert.match(got.why!, /does not say which/);
  });

  it("starts a record that had no times", () => {
    const got = updateResearch({ name: "New" }, outcome(), TODAY);
    assert.deepEqual(got.record.iqamaTimes, TIMES);
  });
});
