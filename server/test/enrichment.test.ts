import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FetchText, HttpResponse } from "@live-azan/shared";
import { enrichMosque, type IqamaStore, type StoredMosque } from "../src/services/iqamaEnrichment";
import type { OpenRow, PrayerName } from "../src/services/iqamaPlan";

// --- a made-up network -------------------------------------------------------------------------------------

type Pages = Record<string, string | { body: string; contentType?: string }>;

function network(pages: Pages): { fetchText: FetchText; asked: string[] } {
  const asked: string[] = [];
  const fetchText: FetchText = async (url) => {
    asked.push(url);
    const reply = pages[url];
    if (reply === undefined) return { url, status: 404, contentType: "text/html", body: "" } satisfies HttpResponse;
    const r = typeof reply === "string" ? { body: reply } : reply;
    return { url, status: 200, contentType: r.contentType ?? "text/html", body: r.body };
  };
  return { fetchText, asked };
}

const page = (body: string): string => `<html><head><title>A Masjid</title></head><body>${body}</body></html>`;
const NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const board = (values = ["6:15", "1:45", "5:45", "7:28", "9:00"]): string => NAMES.map((n, i) => `<p>${n} Iqama ${values[i]}</p>`).join("");
const HOME = "https://masjid.example/";

// --- a made-up database ---------------------------------------------------------------------------------------

type Applied = { close: string[]; add: Array<{ prayer: PrayerName; iqamaTime: string }>; on: Date; source: string; at: Date };

function fakeStore(mosque: StoredMosque | null, open: OpenRow[] = []) {
  const state = { mosque, open: [...open], applied: [] as Applied[], touched: [] as Date[] };
  let next = 100;
  const store: IqamaStore = {
    getMosque: async () => state.mosque,
    openSchedules: async () => state.open.map((row) => ({ ...row })),
    apply: async (_id, change) => {
      state.applied.push(change);
      state.open = state.open.filter((row) => !change.close.includes(row.id));
      for (const row of change.add) state.open.push({ id: `new${next++}`, prayer: row.prayer, iqamaTime: row.iqamaTime });
      if (state.mosque) state.mosque.iqamaLastFetched = change.at;
    },
    touch: async (_id, at) => {
      state.touched.push(at);
      if (state.mosque) state.mosque.iqamaLastFetched = at;
    },
  };
  return { store, state };
}

const waterloo = (over: Partial<StoredMosque> = {}): StoredMosque => ({
  id: "m1",
  name: "A Masjid",
  latitude: 43.4643,
  longitude: -80.5204,
  province: "Ontario",
  country: "Canada",
  website: HOME,
  mawaqitId: null,
  iqamaLastFetched: null,
  ...over,
});

const NOW = new Date(Date.UTC(2026, 8, 20, 15)); // 11:00 in Toronto
const DAY = 86_400_000;

// MAWAQIT's page for a masjid, with today's row.
const monthsOf = (row: unknown[]): unknown[] => Array.from({ length: 12 }, (_, m) => (m === 8 ? { "20": row } : {}));
const mawaqitPage = (iqama: unknown[]): string =>
  `<html><script>var confData = ${JSON.stringify({
    name: "A Masjid",
    calendar: monthsOf(["05:49", "07:06", "13:16", "17:34", "19:24", "20:43"]),
    iqamaCalendar: monthsOf(iqama),
    iqamaEnabled: true,
  })};</script></html>`;
const SEARCH = "https://mawaqit.net/api/2.0/mosque/search?lat=43.464300&lon=-80.520400&radius=2";
const listing = (iqama: unknown[]): Pages => ({
  [SEARCH]: JSON.stringify([{ slug: "a-masjid", uuid: "u-1", name: "A Masjid", latitude: 43.4643, longitude: -80.5204 }]),
  "https://mawaqit.net/en/a-masjid": mawaqitPage(iqama),
});

describe("reading a mosque into the database", () => {
  it("stores what its page says, from the mosque's own today", async () => {
    const { store, state } = fakeStore(waterloo());
    const net = network({ [HOME]: page(board()) });
    const got = await enrichMosque("m1", false, { store, fetchText: net.fetchText, now: NOW });

    assert.equal(got.source, "website");
    assert.deepEqual(got.prayersFound, ["fajr", "dhuhr", "asr", "maghrib", "isha"]);
    assert.deepEqual(got.changed, ["fajr", "dhuhr", "asr", "maghrib", "isha"]);
    assert.equal(state.applied.length, 1);
    assert.deepEqual(state.applied[0].add.map((row) => row.iqamaTime), ["06:15", "13:45", "17:45", "19:28", "21:00"]);
    assert.equal(state.applied[0].source, "website");
    assert.equal(state.applied[0].on.toISOString(), "2026-09-20T00:00:00.000Z");
  });

  it("stores a Maghrib the page gives as 'sunset + 5' as that rule, and leaves it be the next week", async () => {
    const rows = ["Fajr Iqama 6:15", "Dhuhr Iqama 1:45", "Asr Iqama 5:45", "Maghrib Iqama Sunset + 5", "Isha Iqama 9:00"].map((l) => `<p>${l}</p>`).join("");
    const net = network({ [HOME]: page(rows) });
    const { store, state } = fakeStore(waterloo());
    await enrichMosque("m1", false, { store, fetchText: net.fetchText, now: NOW });
    assert.deepEqual(state.applied[0].add.find((row) => row.prayer === "MAGHRIB"), { prayer: "MAGHRIB", iqamaTime: "sunset+5" });
    // the week after, the sun has moved and the rule has not: nothing to write
    const later = new Date(NOW.getTime() + 7 * DAY);
    const again = await enrichMosque("m1", false, { store, fetchText: net.fetchText, now: later });
    assert.deepEqual(again.changed, []);
  });

  it("reads its own timetable plugin, and Jumu'ah with it", async () => {
    const row = (date: string) => ({
      d_date: date,
      fajr_begins: "05:49:00", zuhr_begins: "13:16:00", asr_mithl_1: "17:34:00", asr_mithl_2: "17:34:00", maghrib_begins: "19:24:00", isha_begins: "20:43:00",
      fajr_jamah: "06:15:00", zuhr_jamah: "13:45:00", asr_jamah: "17:45:00", maghrib_jamah: "19:28:00", isha_jamah: "21:00:00",
    });
    const net = network({
      "https://masjid.example/wp-json/dpt/v1/prayertime?filter=today": JSON.stringify([{ d_date: "2026-09-20", jumuah: ["13:30:00"] }]),
      "https://masjid.example/wp-json/dpt/v1/prayertime?filter=year": JSON.stringify([[row("2026-09-20")]]),
    });
    const { store, state } = fakeStore(waterloo());
    const got = await enrichMosque("m1", false, { store, fetchText: net.fetchText, now: NOW });
    assert.equal(got.source, "plugin");
    assert.deepEqual(state.applied[0].add.find((r) => r.prayer === "JUMMAH"), { prayer: "JUMMAH", iqamaTime: "13:30" });
    assert.equal(state.applied[0].source, "plugin");
  });

  it("writes no rows when nothing has changed, and still notes that it looked", async () => {
    const { store, state } = fakeStore(waterloo());
    const net = network({ [HOME]: page(board()) });
    await enrichMosque("m1", false, { store, fetchText: net.fetchText, now: NOW });
    const later = new Date(NOW.getTime() + 7 * DAY);
    const again = await enrichMosque("m1", false, { store, fetchText: net.fetchText, now: later });
    assert.deepEqual(again.changed, []);
    assert.equal(again.prayersFound.length, 5);
    assert.equal(state.applied.length, 2);
    assert.deepEqual(state.applied[1].add, []);
    assert.deepEqual(state.applied[1].close, []);
    assert.equal(state.mosque!.iqamaLastFetched, later);
    assert.equal(state.open.length, 5);
  });

  it("replaces only the time that changed, keeping the old one as history", async () => {
    const open: OpenRow[] = [
      { id: "f", prayer: "FAJR", iqamaTime: "05:45" },
      { id: "d", prayer: "DHUHR", iqamaTime: "13:45" },
      { id: "a", prayer: "ASR", iqamaTime: "17:45" },
      { id: "m", prayer: "MAGHRIB", iqamaTime: "sunset+5" },
      { id: "i", prayer: "ISHA", iqamaTime: "21:00" },
    ];
    const { store, state } = fakeStore(waterloo(), open);
    const got = await enrichMosque("m1", false, { store, fetchText: network({ [HOME]: page(board()) }).fetchText, now: NOW });
    assert.deepEqual(got.changed, ["fajr", "maghrib"]);
    assert.deepEqual(state.applied[0].close.sort(), ["f", "m"]);
  });
});

describe("what is left alone", () => {
  it("stores nothing for a page that names no column, and says so", async () => {
    const guessed = page(NAMES.map((n, i) => `<p>${n}: ${["6:15 am", "1:45 pm", "5:45 pm", "7:28 pm", "9:00 pm"][i]}</p>`).join(""));
    const { store, state } = fakeStore(waterloo());
    const got = await enrichMosque("m1", false, { store, fetchText: network({ [HOME]: guessed }).fetchText, now: NOW });
    assert.deepEqual(got.prayersFound, []);
    assert.equal(got.source, null);
    assert.match(got.why!, /does not say which/);
    assert.deepEqual(state.applied, []);
    assert.deepEqual(state.touched, [NOW]);
  });

  it("stores nothing when the mosque's page and its MAWAQIT listing disagree", async () => {
    const net = network({ ...listing(["06:45", "14:30", "+11", "+4", "21:00"]), [HOME]: page(board(["5:30", "1:30", "5:45", "7:28", "9:00"])) });
    const { store, state } = fakeStore(waterloo({ mawaqitId: "u-1" }));
    const got = await enrichMosque("m1", false, { store, fetchText: net.fetchText, now: NOW });
    assert.equal(got.prayersFound.length, 0);
    assert.match(got.why!, /mawaqit lists different times for fajr, dhuhr/);
    assert.deepEqual(state.applied, []);
  });

  it("stores nothing, and notes it looked, when nothing can be read", async () => {
    const { store, state } = fakeStore(waterloo());
    const got = await enrichMosque("m1", false, { store, fetchText: network({ [HOME]: page("<p>Welcome</p>") }).fetchText, now: NOW });
    assert.equal(got.prayersFound.length, 0);
    assert.ok(got.why && got.why.length > 0);
    assert.deepEqual(state.applied, []);
    assert.equal(state.touched.length, 1);
  });

  it("does not read a mosque it read within the last six days, unless made to", async () => {
    const { store, state } = fakeStore(waterloo({ iqamaLastFetched: new Date(NOW.getTime() - 3 * DAY) }));
    const net = network({ [HOME]: page(board()) });
    const skipped = await enrichMosque("m1", false, { store, fetchText: net.fetchText, now: NOW });
    assert.equal(skipped.alreadyUpToDate, true);
    assert.deepEqual(net.asked, []);
    const forced = await enrichMosque("m1", true, { store, fetchText: net.fetchText, now: NOW });
    assert.equal(forced.source, "website");
    assert.equal(state.applied.length, 1);
  });

  it("reads a mosque last read a week ago", async () => {
    const { store } = fakeStore(waterloo({ iqamaLastFetched: new Date(NOW.getTime() - 7 * DAY) }));
    const got = await enrichMosque("m1", false, { store, fetchText: network({ [HOME]: page(board()) }).fetchText, now: NOW });
    assert.equal(got.source, "website");
  });

  it("says so for a mosque that is not there", async () => {
    const { store } = fakeStore(null);
    const got = await enrichMosque("nope", false, { store, fetchText: network({}).fetchText, now: NOW });
    assert.equal(got.skipped, true);
    assert.equal(got.mosqueName, "unknown");
  });
});

describe("the mosque's day", () => {
  it("is the day at the mosque, not on the server, when they differ", async () => {
    // 02:00 on the 21st in Greenwich is still the evening of the 20th in Vancouver
    const evening = new Date(Date.UTC(2026, 8, 21, 2, 0, 0));
    const vancouver = waterloo({ province: "British Columbia", latitude: 49.28, longitude: -123.12 });
    const net = network({ [HOME]: page(board(["5:45", "1:30", "5:00", "7:15", "8:45"])) });
    const { store, state } = fakeStore(vancouver);
    const got = await enrichMosque("m1", false, { store, fetchText: net.fetchText, now: evening });
    assert.equal(got.source, "website", got.why);
    assert.equal(state.applied[0].on.toISOString(), "2026-09-20T00:00:00.000Z");
  });
});
