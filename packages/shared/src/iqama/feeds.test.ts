import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ymd } from "./clock";
import {
  dptCongregationUnset,
  dptDayFromRows,
  dptApiUrl,
  dptCandidates,
  dptRows,
  dptJumuah,
  dptNewestDay,
  dptSameSite,
  whyPluginNotUsable,
} from "./dpt";
import {
  mawaqitDayFromPage,
  mawaqitDayFromSearch,
  iqamaTableUnset,
  looksLikeMawaqit,
  MawaqitError,
  mawaqitPageUrl,
  parseMawaqitConf,
  parseMawaqitSearch,
  mawaqitSearchUrl,
  mawaqitSlug,
  whyMawaqitNotUsable,
} from "./mawaqit";
import { differing, warningsFor } from "./validate";
import { distanceKm, neighbours, samePlace } from "./place";

const TODAY = ymd(2026, 9, 20); // a Sunday
const WATERLOO = { lat: 43.4643, lon: -80.5204, utcOffsetHours: -4 };

describe("MAWAQIT addresses", () => {
  it("finds the slug in whichever address was pasted", () => {
    assert.equal(mawaqitSlug("https://mawaqit.net/en/waterloo-masjid"), "waterloo-masjid");
    assert.equal(mawaqitSlug("https://mawaqit.net/fr/m/some-masjid?x=1"), "some-masjid");
    assert.equal(mawaqitSlug("https://mawaqit.net/en/w/a-widget#top"), "a-widget");
    assert.equal(mawaqitSlug("a-bare-slug"), "a-bare-slug");
    assert.equal(mawaqitSlug(""), "");
  });

  it("builds the addresses that work", () => {
    assert.equal(mawaqitPageUrl("x-masjid"), "https://mawaqit.net/en/x-masjid");
    assert.equal(mawaqitSearchUrl(43.4643, -80.5204, 1.4), "https://mawaqit.net/api/2.0/mosque/search?lat=43.464300&lon=-80.520400&radius=1");
    assert.ok(looksLikeMawaqit("https://www.mawaqit.net/en/x"));
    assert.ok(!looksLikeMawaqit("https://example.org/"));
  });
});

describe("a MAWAQIT search result", () => {
  // Umul Qura Masjid, as MAWAQIT's search returned it: today's adhan (six) and iqama (five, clock times).
  const item = {
    slug: "umul-qura-masjid",
    times: ["05:48", "07:07", "13:15", "16:42", "19:23", "20:42"],
    iqama: ["06:00", "13:45", "18:15", "19:27", "21:45"],
    iqamaEnabled: true,
    jumua: "13:30",
  };

  it("gives today's five, and the adhans they follow", () => {
    const day = mawaqitDayFromSearch(item);
    assert.deepEqual(day?.iqama, { fajr: "06:00", dhuhr: "13:45", asr: "18:15", maghrib: "19:27", isha: "21:45" });
    assert.deepEqual(day?.adhan, { fajr: "05:48", dhuhr: "13:15", asr: "16:42", maghrib: "19:23", isha: "20:42" });
    assert.equal(day?.jumuah, "13:30");
  });

  it("adds an offset to its own prayer's adhan, not to the entry at the same index", () => {
    const day = mawaqitDayFromSearch({ ...item, iqama: ["+10", "+20", "+30", "+5", "+15"] });
    // times[1] is sunrise; Dhuhr follows times[2], Asr times[3], Maghrib times[4], Isha times[5]
    assert.deepEqual(day?.iqama, { fajr: "05:58", dhuhr: "13:35", asr: "17:12", maghrib: "19:28", isha: "20:57" });
  });

  it("takes a bare number as minutes", () => {
    assert.equal(mawaqitDayFromSearch({ ...item, iqama: [10, 20, 30, 5, 15] })?.iqama.fajr, "05:58");
  });

  it("gives nothing when the masjid switched its congregation times off", () => {
    assert.equal(mawaqitDayFromSearch({ ...item, iqamaEnabled: false }), null);
  });

  it("gives nothing for an entry that is not complete", () => {
    assert.equal(mawaqitDayFromSearch({ ...item, iqama: ["06:00", "13:45", null, "19:27", "21:45"] }), null);
    assert.equal(mawaqitDayFromSearch({ slug: "x" }), null);
  });

  it("reads a search response whichever wrapper it comes in", () => {
    assert.equal(parseMawaqitSearch([item, { name: "no slug" }]).length, 1);
    assert.equal(parseMawaqitSearch({ mosques: [item] }).length, 1);
    assert.deepEqual(parseMawaqitSearch("nonsense"), []);
  });
});

describe("a MAWAQIT page", () => {
  const months = (day: string, row: unknown[]): unknown[] => Array.from({ length: 12 }, (_, m) => (m === 8 ? { [day]: row } : {}));
  const conf = {
    name: "A Masjid",
    calendar: months("20", ["05:49", "07:06", "13:16", "17:34", "19:24", "20:43"]),
    iqamaCalendar: months("20", ["06:15", "13:45", "+11", "+4", "21:00"]),
    jumua: "13:30",
    iqamaEnabled: true,
  };

  it("reads the confData out of the page even with braces and quotes in its announcements", () => {
    const tricky = { ...conf, announcement: 'a "quoted" } brace { and \\ a backslash' };
    const html = `<html><script>var x = 1; var confData = ${JSON.stringify(tricky)}; var y = {};</script></html>`;
    const read = parseMawaqitConf(html);
    assert.equal(read.name, "A Masjid");
    assert.equal(read.announcement, 'a "quoted" } brace { and \\ a backslash');
  });

  it("says when a page carries no timetable", () => {
    assert.throws(() => parseMawaqitConf("<html>nothing</html>"), MawaqitError);
    assert.throws(() => parseMawaqitConf("var confData = {not json"), MawaqitError);
  });

  it("gives today's five, offsets added to their own prayer's adhan", () => {
    const day = mawaqitDayFromPage(conf, TODAY);
    assert.deepEqual(day?.iqama, { fajr: "06:15", dhuhr: "13:45", asr: "17:45", maghrib: "19:28", isha: "21:00" });
    assert.equal(day?.jumuah, "13:30");
  });

  it("gives nothing for a day the year has no row for", () => {
    assert.equal(mawaqitDayFromPage(conf, ymd(2026, 9, 21)), null);
  });

  it("knows a table nobody filled in", () => {
    const zeros = { ...conf, iqamaCalendar: months("20", ["+0", "+0", "+0", "+0", "+0"]) };
    assert.equal(iqamaTableUnset(zeros.calendar, zeros.iqamaCalendar), true);
    const sameMinute = { ...conf, iqamaCalendar: months("20", ["05:49", "13:16", "17:34", "19:24", "21:00"]) };
    assert.equal(iqamaTableUnset(sameMinute.calendar, sameMinute.iqamaCalendar), true);
    assert.equal(iqamaTableUnset(conf.calendar, conf.iqamaCalendar), false);
  });

  it("says why a page is no use, in words a masjid can act on", () => {
    assert.match(whyMawaqitNotUsable({ name: "x" }), /no timetable/);
    assert.match(whyMawaqitNotUsable({ ...conf, iqamaEnabled: false }), /switched its congregation times off/);
    assert.match(whyMawaqitNotUsable({ ...conf, iqamaCalendar: months("20", ["+0", "+0", "+0", "+0", "+0"]) }), /no congregation times/);
    assert.equal(whyMawaqitNotUsable(conf), "");
  });
});

describe("the mosque's own timetable plugin", () => {
  const row = (date: string, jamah: string[], begins: string[]) => ({
    d_date: date,
    fajr_begins: begins[0], zuhr_begins: begins[1], asr_mithl_1: begins[2], asr_mithl_2: begins[2], maghrib_begins: begins[3], isha_begins: begins[4],
    fajr_jamah: jamah[0], zuhr_jamah: jamah[1], asr_jamah: jamah[2], maghrib_jamah: jamah[3], isha_jamah: jamah[4],
  });
  const good = row("2026-09-20", ["06:15:00", "13:45:00", "17:45:00", "19:28:00", "21:00:00"], ["05:49:00", "13:16:00", "17:34:00", "19:24:00", "20:43:00"]);

  it("tries each parent path, never the bare domain once a path is given", () => {
    assert.deepEqual(dptCandidates("https://centres.example/icwaterloo/prayers"), ["https://centres.example/icwaterloo/prayers", "https://centres.example/icwaterloo"]);
    assert.deepEqual(dptCandidates("https://mosque.example"), ["https://mosque.example"]);
    assert.deepEqual(dptCandidates("not a url"), []);
    assert.equal(dptApiUrl("https://mosque.example/", "year"), "https://mosque.example/wp-json/dpt/v1/prayertime?filter=year");
  });

  it("refuses an answer that came from another mosque's path", () => {
    assert.equal(dptSameSite("https://centres.example/icwaterloo", "https://centres.example/icwaterloo/wp-json/x"), true);
    assert.equal(dptSameSite("https://centres.example/icwaterloo", "https://centres.example/wp-json/x"), false);
    assert.equal(dptSameSite("https://a.example/x", "https://b.example/x"), false);
  });

  it("flattens the rows however the answer nested them", () => {
    assert.equal(dptRows([[good, good], good]).length, 3);
    assert.equal(dptRows({ nothing: true }).length, 0);
  });

  it("gives today's congregation times, not the start times", () => {
    const day = dptDayFromRows([good], TODAY);
    assert.deepEqual(day?.iqama, { fajr: "06:15", dhuhr: "13:45", asr: "17:45", maghrib: "19:28", isha: "21:00" });
    assert.equal(day?.adhan?.fajr, "05:49");
  });

  it("puts Jumu'ah in from the 'today' answer", () => {
    assert.deepEqual(dptJumuah([{ d_date: "2026-09-20", jumuah: ["13:30:00", "14:30:00"] }]), ["13:30:00", "14:30:00"]);
    assert.equal(dptDayFromRows([good], TODAY, ["13:30:00"])?.jumuah, "13:30");
  });

  it("treats 00:00 as 'not set'", () => {
    assert.equal(dptDayFromRows([{ ...good, fajr_jamah: "00:00:00" }], TODAY), null);
  });

  it("knows a timetable that stops at last year", () => {
    const old = row("2025-12-31", ["06:15:00", "13:45:00", "17:45:00", "19:28:00", "21:00:00"], ["05:49:00", "13:16:00", "17:34:00", "19:24:00", "20:43:00"]);
    assert.equal(dptNewestDay([old, good]), "2026-09-20");
    assert.match(whyPluginNotUsable([old], TODAY), /stops at 2025-12-31/);
    assert.equal(whyPluginNotUsable([good], TODAY), "");
    assert.match(whyPluginNotUsable([], TODAY), /not put a timetable/);
  });

  it("knows congregation columns that are only the start times", () => {
    const unset = row("2026-09-20", ["05:49", "13:16", "17:34", "19:24", "20:43"], ["05:49", "13:16", "17:34", "19:24", "20:43"]);
    assert.equal(dptCongregationUnset([unset, unset]), true);
    assert.equal(dptCongregationUnset([good]), false);
    assert.match(whyPluginNotUsable([unset], TODAY), /no congregation/);
  });
});

describe("is what a feed says believable?", () => {
  const fits = { fajr: "06:15", dhuhr: "13:45", asr: "17:45", maghrib: "19:28", isha: "21:00" };

  it("has nothing to say about a timetable that fits", () => {
    assert.deepEqual(warningsFor(fits, { today: TODAY, where: WATERLOO, adhan: { fajr: "05:49", dhuhr: "13:16", asr: "17:34", maghrib: "19:24", isha: "20:43" } }), []);
  });

  it("objects to Fajr two minutes before sunrise, which is what a stale listing did", () => {
    const warnings = warningsFor({ ...fits, fajr: "07:05" }, { today: TODAY, where: WATERLOO }); // sunrise is 07:07
    assert.ok(warnings.some((w) => /^Fajr at 07:05 is not possible on this day here/.test(w)), warnings.join("; "));
    assert.deepEqual(warningsFor({ ...fits, fajr: "06:59" }, { today: TODAY, where: WATERLOO }), []); // a mosque may pray late
  });

  it("objects to prayers out of order and to a time no iqama could be", () => {
    assert.ok(warningsFor({ ...fits, dhuhr: "18:00" }, { today: TODAY }).some((w) => /not in order/.test(w)));
    assert.ok(warningsFor({ ...fits, fajr: "00:57" }, { today: TODAY }).some((w) => /Fajr at 00:57 cannot be/.test(w)));
  });

  it("objects to an iqama before its adhan, and to iqamas that are only the adhans", () => {
    const adhan = { fajr: "06:30", dhuhr: "13:16", asr: "17:34", maghrib: "19:24", isha: "20:43" };
    assert.ok(warningsFor(fits, { today: TODAY, adhan }).some((w) => /before its adhan/.test(w)));
    assert.ok(warningsFor(adhan, { today: TODAY, adhan }).some((w) => /never entered/.test(w)));
  });

  it("compares two readings, ignoring a few minutes", () => {
    assert.deepEqual(differing(fits, { ...fits, fajr: "06:20", isha: "21:08" }), []);
    assert.deepEqual(differing(fits, { ...fits, fajr: "06:00", asr: "18:15" }), ["fajr", "asr"]);
    assert.deepEqual(differing({ fajr: "06:15" }, { dhuhr: "13:45" }), []);
  });
});

describe("which mosque is which", () => {
  const a = { name: "Masjid Al-Noor", latitude: 51.05, longitude: -114.07 };

  it("takes one mosque in two lists for one, whatever each calls it, when they are on the same spot", () => {
    assert.equal(samePlace(a, { name: "Prayer Hall", latitude: 51.0503, longitude: -114.0702 }), true);
  });

  it("takes a shared distinctive word and a few hundred metres for one", () => {
    assert.equal(samePlace(a, { name: "Al Noor Islamic Centre", latitude: 51.0508, longitude: -114.0709 }), true);
  });

  it("does not mind accents: a Quebec mosque is the same one with or without them", () => {
    const quebec = { name: "Mosquée de Québec", latitude: 46.8, longitude: -71.2 };
    assert.equal(samePlace(quebec, { name: "mosquee de quebec", latitude: 46.804, longitude: -71.2 }), true);
  });

  it("does not take two mosques down one street for one", () => {
    assert.equal(samePlace(a, { name: "Dar ul Hikmah", latitude: 51.0536, longitude: -114.07 }), false);
  });

  it("does not take one name in two cities for one", () => {
    assert.equal(samePlace(a, { name: "Masjid Al-Noor", latitude: 43.65, longitude: -79.38 }), false);
  });

  it("measures distance", () => {
    assert.ok(Math.abs(distanceKm(43.4643, -80.5204, 43.6532, -79.3832) - 96) < 2);
    assert.equal(distanceKm(Number.NaN, 0, 0, 0), Number.POSITIVE_INFINITY);
  });

  it("lists the neighbours nearest first, never the mosque itself, and none beyond the radius", () => {
    const list = [
      { name: "Far", latitude: 44.5, longitude: -80.06 },
      { name: "Near", latitude: 43.8, longitude: -80.06 },
      { name: "Nearer", latitude: 43.78, longitude: -80.06 },
      { name: "Erin Centre", latitude: 43.77, longitude: -80.06 },
    ];
    const found = neighbours({ name: "Erin Centre", latitude: 43.77, longitude: -80.06 }, list);
    assert.deepEqual(found.map((n) => n.place.name), ["Nearer", "Near"]);
    assert.ok(found[0].km < found[1].km);
  });
});
