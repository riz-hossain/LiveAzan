import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ymd } from "./clock";
import { borrowFromNeighbour, embeddedPage, postedAsFile, readMawaqit, readMosque, readPlugin, readWebsite } from "./pipeline";
import type { ReadContext, FetchText, HttpResponse, MosqueInput } from "./pipeline";

const TODAY = ymd(2026, 9, 20);
const WATERLOO = { lat: 43.4643, lon: -80.5204, utcOffsetHours: -4 };
const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

// --- a made-up network --------------------------------------------------------------------------------
type Reply = string | { body: string; status?: number; contentType?: string; url?: string };

function network(pages: Record<string, Reply>, dead: string[] = []): { fetchText: FetchText; asked: string[] } {
  const asked: string[] = [];
  const fetchText: FetchText = async (url) => {
    asked.push(url);
    if (dead.some((host) => url.includes(host))) throw new Error("getaddrinfo ENOTFOUND");
    const reply = pages[url];
    if (reply === undefined) return { url, status: 404, contentType: "text/html", body: "" } satisfies HttpResponse;
    const r = typeof reply === "string" ? { body: reply } : reply;
    return { url: r.url ?? url, status: r.status ?? 200, contentType: r.contentType ?? "text/html", body: r.body };
  };
  return { fetchText, asked };
}

const context = (net: ReturnType<typeof network>, extra: Partial<ReadContext> = {}): ReadContext => ({
  fetchText: net.fetchText,
  today: TODAY,
  where: WATERLOO,
  ...extra,
});

const page = (body: string): string => `<html><head><title>A Masjid</title></head><body>${body}</body></html>`;
const board = (values = ["6:15", "1:45", "5:45", "7:28", "9:00"]): string => PRAYERS.map((n, i) => `<p>${n} Iqama ${values[i]}</p>`).join("");
const GOOD = { fajr: "06:15", dhuhr: "13:45", asr: "17:45", maghrib: "19:28", isha: "21:00" };

// MAWAQIT's page for a masjid, with today's row.
const monthsOf = (row: unknown[]): unknown[] => Array.from({ length: 12 }, (_, m) => (m === 8 ? { "20": row } : {}));
const mawaqitPage = (iqama: unknown[], extra: Record<string, unknown> = {}): string =>
  `<html><script>var confData = ${JSON.stringify({
    name: "A Masjid",
    calendar: monthsOf(["05:49", "07:06", "13:16", "17:34", "19:24", "20:43"]),
    iqamaCalendar: monthsOf(iqama),
    iqamaEnabled: true,
    ...extra,
  })};</script></html>`;

const MASJID: MosqueInput = { name: "A Masjid", latitude: 43.4643, longitude: -80.5204 };

describe("reading a mosque's website", () => {
  it("reads the page it links to as prayer times when the home page has nothing", async () => {
    const net = network({
      "https://masjid.example/": page('<a href="/prayer-times/">Prayer Times</a><a href="https://www.facebook.com/x">Facebook</a><p>Welcome</p>'),
      "https://masjid.example/prayer-times/": page(board()),
    });
    const got = await readWebsite("https://masjid.example/", context(net));
    assert.ok(got.ok);
    assert.deepEqual(got.reading.times, GOOD);
    assert.equal(got.reading.how, "labelled");
    assert.equal(got.reading.source, "website");
    assert.equal(got.reading.page, "https://masjid.example/prayer-times/");
    assert.equal(got.reading.asOf, "2026-09-20");
    assert.equal(got.title, "A Masjid");
  });

  it("carries a Maghrib the page gave as a rule through with the reading", async () => {
    const rows = ["Fajr Iqama 6:15", "Dhuhr Iqama 1:45", "Asr Iqama 5:45", "Maghrib Iqama Sunset + 5", "Isha Iqama 9:00"].map((l) => `<p>${l}</p>`).join("");
    const net = network({ "https://masjid.example/": page(rows) });
    const got = await readWebsite("https://masjid.example/", context(net));
    assert.ok(got.ok);
    assert.equal(got.reading.maghribRule, "sunset+5");
    assert.deepEqual(got.reading.computed, ["maghrib"]);
    assert.match(got.reading.times.maghrib, /^19:2\d$/);
  });

  it("asks a browser only when the plain pages had nothing", async () => {
    const script = page('<div id="t"></div><script>document.getElementById("t").innerHTML="..."</script>');
    const drawn: string[] = [];
    const render = async (url: string) => {
      drawn.push(url);
      return { url, html: page(board()) };
    };
    const net = network({ "https://masjid.example/": script });
    const got = await readWebsite("https://masjid.example/", context(net, { render }));
    assert.ok(got.ok);
    assert.deepEqual(got.reading.times, GOOD);
    assert.deepEqual(drawn, ["https://masjid.example/"]);

    const plain = network({ "https://masjid.example/": page(board()) });
    drawn.length = 0;
    await readWebsite("https://masjid.example/", context(plain, { render }));
    assert.deepEqual(drawn, []);
  });

  it("says a site that is down is down, and a site with nothing on it has nothing", async () => {
    const down = await readWebsite("https://gone.example/", context(network({}, ["gone.example"])));
    assert.ok(!down.ok && down.reason === "unreachable");
    const empty = await readWebsite("https://masjid.example/", context(network({ "https://masjid.example/": page("<p>Welcome</p>") })));
    assert.ok(!empty.ok && empty.reason === "no_times");
  });

  it("says when the timetable is a picture or a PDF", async () => {
    const picture = network({ "https://masjid.example/": page('<img src="/wp-content/uploads/prayer-timetable-sept.jpg">') });
    const a = await readWebsite("https://masjid.example/", context(picture));
    assert.ok(!a.ok && a.reason === "image" && /image/.test(a.detail));
    const pdf = network({ "https://masjid.example/": page('<a href="/files/iqama-schedule.pdf">Schedule</a>') });
    const b = await readWebsite("https://masjid.example/", context(pdf));
    assert.ok(!b.ok && b.reason === "pdf");
    assert.equal(postedAsFile("nothing here"), "");
  });

  it("does not read a June board on a September page, given where the mosque is", async () => {
    const june = page(PRAYERS.map((n, i) => `<p>${n} Athan ${["3:35 AM", "1:16 PM", "5:34 PM", "9:00 PM", "10:30 PM"][i]} Iqama ${["4:00 AM", "1:45 PM", "6:15 PM", "9:10 PM", "10:45 PM"][i]}</p>`).join(""));
    const net = network({ "https://masjid.example/": june });
    assert.ok(!(await readWebsite("https://masjid.example/", context(net))).ok);
  });
});

describe("the mosque's own timetable plugin", () => {
  const row = (date: string, jamah: string[]) => ({
    d_date: date,
    fajr_begins: "05:49:00", zuhr_begins: "13:16:00", asr_mithl_1: "17:34:00", asr_mithl_2: "17:34:00", maghrib_begins: "19:24:00", isha_begins: "20:43:00",
    fajr_jamah: jamah[0], zuhr_jamah: jamah[1], asr_jamah: jamah[2], maghrib_jamah: jamah[3], isha_jamah: jamah[4],
  });
  const today = (jumuah: string[] = ["13:30:00"]): string => JSON.stringify([{ d_date: "2026-09-20", jumuah }]);
  const api = (rows: unknown[]): Record<string, Reply> => ({
    "https://masjid.example/wp-json/dpt/v1/prayertime?filter=today": today(),
    "https://masjid.example/wp-json/dpt/v1/prayertime?filter=year": JSON.stringify([rows]),
  });
  const goodRow = row("2026-09-20", ["06:15:00", "13:45:00", "17:45:00", "19:28:00", "21:00:00"]);

  it("reads it, exactly, with Jumu'ah from the 'today' answer", async () => {
    const got = await readPlugin("https://masjid.example/", context(network(api([goodRow]))));
    assert.equal(got.state, "ok");
    if (got.state !== "ok") return;
    assert.deepEqual(got.reading.times, GOOD);
    assert.equal(got.reading.how, "exact");
    assert.equal(got.reading.source, "plugin");
    assert.equal(got.reading.jumuah, "13:30");
  });

  it("is not there when the site has no plugin", async () => {
    assert.deepEqual(await readPlugin("https://masjid.example/", context(network({}))), { state: "none" });
  });

  it("names a timetable that stopped, and one whose congregation times were never entered", async () => {
    const old = await readPlugin("https://masjid.example/", context(network(api([row("2025-12-31", ["06:15:00", "13:45:00", "17:45:00", "19:28:00", "21:00:00"])]))));
    assert.ok(old.state === "broken" && /stops at 2025-12-31/.test(old.detail));
    const unset = row("2026-09-20", ["05:49:00", "13:16:00", "17:34:00", "19:24:00", "20:43:00"]);
    const never = await readPlugin("https://masjid.example/", context(network(api([unset]))));
    assert.ok(never.state === "broken" && /no congregation/.test(never.detail));
  });

  it("does not take the parent domain's times for a mosque with a path of its own", async () => {
    const net = network({
      "https://centres.example/wp-json/dpt/v1/prayertime?filter=today": today(),
      "https://centres.example/wp-json/dpt/v1/prayertime?filter=year": JSON.stringify([[goodRow]]),
    });
    assert.deepEqual(await readPlugin("https://centres.example/icwaterloo/", context(net)), { state: "none" });
  });

  it("does not take an answer that came from somewhere else", async () => {
    // a redirect off the mosque's site altogether
    const away = network({
      "https://masjid.example/wp-json/dpt/v1/prayertime?filter=today": { body: today(), url: "https://other.example/wp-json/dpt/v1/prayertime?filter=today" },
      "https://masjid.example/wp-json/dpt/v1/prayertime?filter=year": JSON.stringify([[goodRow]]),
    });
    assert.deepEqual(await readPlugin("https://masjid.example/", context(away)), { state: "none" });
    // ...and one that drops the mosque's own path, onto the main site of a multisite
    const parent = network({
      "https://centres.example/icwaterloo/wp-json/dpt/v1/prayertime?filter=today": { body: today(), url: "https://centres.example/wp-json/dpt/v1/prayertime?filter=today" },
      "https://centres.example/icwaterloo/wp-json/dpt/v1/prayertime?filter=year": JSON.stringify([[goodRow]]),
    });
    assert.deepEqual(await readPlugin("https://centres.example/icwaterloo/", context(parent)), { state: "none" });
  });

  it("finds a multisite mosque's API from the address of one of its pages", async () => {
    const own = network({
      "https://centres.example/icwaterloo/wp-json/dpt/v1/prayertime?filter=today": today(),
      "https://centres.example/icwaterloo/wp-json/dpt/v1/prayertime?filter=year": JSON.stringify([[goodRow]]),
    });
    const got = await readPlugin("https://centres.example/icwaterloo/prayer-times/", context(own));
    assert.equal(got.state, "ok");
    if (got.state === "ok") assert.deepEqual(got.reading.times, GOOD);
  });

  it("does not end the search: the page says more than a stale plugin, if the sun agrees", async () => {
    const stale = row("2025-12-31", ["06:15:00", "13:45:00", "17:45:00", "19:28:00", "21:00:00"]);
    const pages = { ...api([stale]), "https://masjid.example/": page(board()) };
    const got = await readMosque({ ...MASJID, website: "https://masjid.example/" }, context(network(pages)));
    assert.deepEqual(got.reading?.times, GOOD);
    assert.equal(got.reading?.source, "website");
    // ...but with no way to check the page against the sun, a stale plugin is not trusted over it
    const blind = await readMosque({ ...MASJID, website: "https://masjid.example/" }, context(network(pages), { where: null }));
    assert.equal(blind.reading, null);
    assert.ok(blind.problems.some((p) => /stops at 2025-12-31/.test(p)), blind.problems.join("; "));
  });
});

describe("MAWAQIT", () => {
  it("reads a mosque's page, offsets and all", async () => {
    const net = network({ "https://mawaqit.net/en/a-masjid": mawaqitPage(["06:15", "13:45", "+11", "+4", "21:00"]) });
    const got = await readMawaqit({ ...MASJID, mawaqitSlug: "a-masjid" }, context(net));
    assert.ok(got.ok);
    assert.deepEqual(got.reading.times, GOOD);
    assert.equal(got.reading.how, "exact");
    assert.equal(got.reading.source, "mawaqit");
  });

  it("finds a mosque by where it is, and not a masjid down the street", async () => {
    const search = JSON.stringify([
      { slug: "dar-ul-hikmah", name: "Dar ul Hikmah", latitude: 43.4679, longitude: -80.5204, times: [], iqama: [] },
      { slug: "a-masjid", name: "A Masjid Waterloo", latitude: 43.4644, longitude: -80.5205, times: [], iqama: [] },
    ]);
    const net = network({
      "https://mawaqit.net/api/2.0/mosque/search?lat=43.464300&lon=-80.520400&radius=2": search,
      "https://mawaqit.net/en/a-masjid": mawaqitPage(["06:15", "13:45", "+11", "+4", "21:00"]),
    });
    const got = await readMawaqit(MASJID, context(net));
    assert.ok(got.ok);
    assert.equal(got.reading.page, "https://mawaqit.net/en/a-masjid");
    assert.ok(!net.asked.some((u) => u.includes("dar-ul-hikmah")));
  });

  it("does not take another mosque's listing for this one's because it is close by", async () => {
    const search = JSON.stringify([{ slug: "dar-ul-hikmah", name: "Dar ul Hikmah", latitude: 43.4679, longitude: -80.5204, times: [], iqama: [] }]);
    const net = network({
      "https://mawaqit.net/api/2.0/mosque/search?lat=43.464300&lon=-80.520400&radius=2": search,
      "https://mawaqit.net/en/dar-ul-hikmah": mawaqitPage(["06:00", "13:30", "+10", "+5", "21:30"]),
    });
    const got = await readMawaqit(MASJID, context(net));
    assert.ok(!got.ok && /not on mawaqit/.test(got.detail), JSON.stringify(got));
    assert.ok(!net.asked.some((u) => u.includes("dar-ul-hikmah")));
  });

  it("holds to the listing it was told about, even when another is nearer", async () => {
    const search = JSON.stringify([
      { slug: "other-masjid", name: "Other Masjid", latitude: 43.4644, longitude: -80.5205, uuid: "u-2", times: [], iqama: [] },
      { slug: "a-masjid", name: "A Masjid", latitude: 43.466, longitude: -80.5204, uuid: "u-1", times: [], iqama: [] },
    ]);
    const net = network({
      "https://mawaqit.net/api/2.0/mosque/search?lat=43.464300&lon=-80.520400&radius=2": search,
      "https://mawaqit.net/en/a-masjid": mawaqitPage(["06:15", "13:45", "+11", "+4", "21:00"]),
      "https://mawaqit.net/en/other-masjid": mawaqitPage(["06:00", "13:30", "+10", "+5", "21:30"]),
    });
    const got = await readMawaqit({ ...MASJID, mawaqitId: "u-1" }, context(net));
    assert.ok(got.ok);
    assert.deepEqual(got.reading.times, GOOD);
    assert.ok(!net.asked.some((u) => u.includes("other-masjid")));
  });

  it("says so when mawaqit.net is limiting requests, rather than that the mosque could not be found", async () => {
    const limited: Reply = { body: "error code: 1015", status: 429, contentType: "text/plain" };
    const search = network({ "https://mawaqit.net/api/2.0/mosque/search?lat=43.464300&lon=-80.520400&radius=2": limited });
    const a = await readMawaqit(MASJID, context(search));
    assert.ok(!a.ok && /limiting requests/.test(a.detail), JSON.stringify(a));
    const page_ = network({ "https://mawaqit.net/en/a-masjid": limited });
    const b = await readMawaqit({ ...MASJID, mawaqitSlug: "a-masjid" }, context(page_));
    assert.ok(!b.ok && /limiting requests/.test(b.detail), JSON.stringify(b));
    // and the mosque's own page is still read
    const both = network({ "https://mawaqit.net/api/2.0/mosque/search?lat=43.464300&lon=-80.520400&radius=2": limited, "https://masjid.example/": page(board()) });
    const got = await readMosque({ ...MASJID, website: "https://masjid.example/" }, context(both));
    assert.deepEqual(got.reading?.times, GOOD);
  });

  it("says when a mosque is not there, and when it switched its congregation times off", async () => {
    const empty = network({ "https://mawaqit.net/api/2.0/mosque/search?lat=43.464300&lon=-80.520400&radius=2": "[]" });
    const a = await readMawaqit(MASJID, context(empty));
    assert.ok(!a.ok && /not on mawaqit/.test(a.detail));
    const off = network({ "https://mawaqit.net/en/a-masjid": mawaqitPage(["06:15", "13:45", "+11", "+4", "21:00"], { iqamaEnabled: false }) });
    const b = await readMawaqit({ ...MASJID, mawaqitSlug: "a-masjid" }, context(off));
    assert.ok(!b.ok && /switched its congregation times off/.test(b.detail));
  });

  it("fills in from the search result when the page cannot be read", async () => {
    const item = { slug: "a-masjid", name: "A Masjid", latitude: 43.4643, longitude: -80.5204, uuid: "u-1", times: ["05:49", "07:06", "13:16", "17:34", "19:24", "20:43"], iqama: ["06:15", "13:45", "17:45", "19:28", "21:00"], iqamaEnabled: true };
    const net = network({ "https://mawaqit.net/api/2.0/mosque/search?lat=43.464300&lon=-80.520400&radius=2": JSON.stringify([item]) });
    const got = await readMawaqit({ ...MASJID, mawaqitId: "u-1" }, context(net));
    assert.ok(got.ok);
    assert.deepEqual(got.reading.times, GOOD);
  });

  it("warns, but does not refuse, a listing the sun objects to", async () => {
    const net = network({ "https://mawaqit.net/en/a-masjid": mawaqitPage(["07:05", "13:45", "+11", "+4", "21:00"]) });
    const got = await readMawaqit({ ...MASJID, mawaqitSlug: "a-masjid" }, context(net));
    assert.ok(got.ok);
    assert.ok(got.reading.warnings.some((w) => /^Fajr at 07:05 is not possible/.test(w)), got.reading.warnings.join("; "));
  });
});

describe("a page the site embeds", () => {
  it("is found when there is exactly one", () => {
    assert.deepEqual(embeddedPage('<iframe src="https://mawaqit.net/fr/w/islamic-society-of-belleville?x=1"></iframe>'), {
      kind: "mawaqit", slug: "islamic-society-of-belleville", url: "https://mawaqit.net/en/islamic-society-of-belleville",
    });
    assert.equal(embeddedPage('<a href="https://masjidbox.com/prayer-times/Umulqura">Prayer Times</a>')?.url, "https://masjidbox.com/prayer-times/umulqura");
  });

  it("is not followed when the page links several: those are other mosques", () => {
    assert.equal(embeddedPage('<a href="https://mawaqit.net/en/a-masjid-one">x</a><a href="https://mawaqit.net/en/a-masjid-two">y</a>'), null);
    assert.equal(embeddedPage("<html>nothing here</html>"), null);
  });

  it("is read: a mawaqit widget by its page, a masjidbox page in a browser", async () => {
    const withWidget = network({
      "https://masjid.example/": page('<iframe src="https://mawaqit.net/en/w/a-masjid"></iframe>'),
      "https://mawaqit.net/en/a-masjid": mawaqitPage(["06:15", "13:45", "+11", "+4", "21:00"]),
    });
    const a = await readMosque({ ...MASJID, website: "https://masjid.example/" }, context(withWidget));
    assert.deepEqual(a.reading?.times, GOOD);
    assert.equal(a.reading?.source, "mawaqit");

    const boxed = network({ "https://masjid.example/": page('<a href="https://masjidbox.com/prayer-times/a-masjid">Prayer Times</a>') });
    const render = async (url: string) => ({ url, html: page(board()) });
    const b = await readMosque({ ...MASJID, website: "https://masjid.example/" }, context(boxed, { render }));
    assert.deepEqual(b.reading?.times, GOOD);
    assert.equal(b.reading?.page, "https://masjidbox.com/prayer-times/a-masjid");
  });
});

describe("a listing and the mosque's own page", () => {
  const listing = (iqama: unknown[]): Record<string, Reply> => ({ "https://mawaqit.net/en/a-masjid": mawaqitPage(iqama) });
  const mosque = { ...MASJID, website: "https://masjid.example/", mawaqitSlug: "a-masjid" };

  it("agreeing are one thing said twice", async () => {
    const net = network({ ...listing(["06:15", "13:45", "+11", "+4", "21:00"]), "https://masjid.example/": page(board()) });
    const got = await readMosque(mosque, context(net));
    assert.deepEqual(got.reading?.times, GOOD);
    assert.equal(got.reading?.corroboratedBy, "mawaqit");
    assert.equal(got.disagreement, undefined);
  });

  it("disagreeing, the page that says which is the iqama is offered and the listing named as the dissenter", async () => {
    // What mawaqit.net held for Ottawa South: Fajr at 6:45, Dhuhr at 2:30. The masjid's page said 5:30 and 1:30.
    const net = network({ ...listing(["06:45", "14:30", "+11", "+4", "21:00"]), "https://masjid.example/": page(board(["5:30", "1:30", "5:45", "7:28", "9:00"])) });
    const got = await readMosque(mosque, context(net));
    assert.equal(got.reading?.source, "website");
    assert.equal(got.reading?.times.fajr, "05:30");
    assert.deepEqual(got.disagreement, { prayers: ["fajr", "dhuhr"], chosen: "website", other: "mawaqit" });
    assert.equal(got.alternatives[0]?.source, "mawaqit");
    assert.equal(got.alternatives[0]?.times.fajr, "06:45");
  });

  it("disagreeing with a page that was only guessed at, the listing stands and the page is the alternative", async () => {
    // one time per prayer under no label: judged from the numbers alone
    const guessed = page(PRAYERS.map((n, i) => `<p>${n}: ${["5:30 am", "1:30 pm", "5:30 pm", "7:28 pm", "9:00 pm"][i]}</p>`).join(""));
    const net = network({ ...listing(["06:45", "14:30", "+11", "+4", "21:00"]), "https://masjid.example/": guessed });
    const got = await readMosque(mosque, context(net));
    assert.equal(got.reading?.source, "mawaqit");
    assert.equal(got.disagreement?.other, "website");
    assert.equal(got.alternatives[0]?.how, "guessed");
  });

  it("with the site down, the listing is what there is", async () => {
    const net = network(listing(["06:15", "13:45", "+11", "+4", "21:00"]), ["masjid.example"]);
    const got = await readMosque(mosque, context(net));
    assert.deepEqual(got.reading?.times, GOOD);
    assert.ok(got.problems.some((p) => /could not reach the mosque's website/.test(p)));
  });

  it("with nothing anywhere, says why", async () => {
    const got = await readMosque({ ...MASJID, website: "https://masjid.example/" }, context(network({ "https://masjid.example/": page("<p>Welcome</p>") })));
    assert.equal(got.reading, null);
    assert.ok(got.problems.length >= 1);
  });
});

describe("borrowing a neighbour's times", () => {
  const near = (name: string, dLat: number, website: string): MosqueInput => ({ name, latitude: 43.77 + dLat, longitude: -80.06, website });
  const erin: MosqueInput = { name: "Erin Centre", latitude: 43.77, longitude: -80.06 };
  const pages: Record<string, Reply> = {
    "https://nearer.example/": page(board()),
    "https://near.example/": page(board(["6:30", "2:00", "6:00", "7:30", "9:30"])),
    "https://far.example/": page(board()),
  };

  it("takes the nearest whose times read, and says how far", async () => {
    const net = network(pages);
    const got = await borrowFromNeighbour(
      erin,
      [near("Far", 0.73, "https://far.example/"), near("Near", 0.03, "https://near.example/"), near("Nearer", 0.01, "https://nearer.example/"), erin],
      context(net, { where: { lat: 43.77, lon: -80.06, utcOffsetHours: -4 } })
    );
    assert.equal(got?.from.name, "Nearer");
    assert.ok(got && got.from.km > 0.5 && got.from.km < 1.5);
    assert.equal(got?.reading.source, "nearby");
    assert.deepEqual(got?.reading.times, GOOD);
    assert.ok(!net.asked.some((u) => u.includes("far.example") || u.includes("near.example")), "nearest first, and it stops at the first that works");
  });

  it("goes on to the next when the nearest has nothing", async () => {
    const net = network({ ...pages, "https://nearer.example/": page("<p>Jumu'ah at 1:30</p>") });
    const got = await borrowFromNeighbour(erin, [near("Near", 0.03, "https://near.example/"), near("Nearer", 0.01, "https://nearer.example/")], context(net));
    assert.equal(got?.from.name, "Near");
  });

  it("does not go beyond twenty-five kilometres", async () => {
    const net = network(pages);
    assert.equal(await borrowFromNeighbour(erin, [near("Far", 0.73, "https://far.example/")], context(net)), null);
    assert.ok(!net.asked.some((u) => u.includes("far.example")));
  });

  it("gives up when its time is spent", async () => {
    let clock = 0;
    const net = network(pages);
    const got = await borrowFromNeighbour(erin, [near("Nearer", 0.01, "https://nearer.example/")], context(net, { now: () => (clock += 200_000) }));
    assert.equal(got, null);
  });
});
