/**
 * Every layout here was met on a real mosque website while this reader was built
 * (in the floating-clock desktop app, where it was measured on 160 sites), and
 * every refusal is a page that a careless reader would have got wrong: a
 * placeholder table, a June timetable on a September page, a week of different
 * days with no way to say which is today. The fixtures are small, made-up pages
 * in those shapes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sunToday } from "./astro";
import { hhmm, ymd } from "./clock";
import { flatten, pageLinks, pageTitle, resolveUrl } from "./html";
import { extractIqama, type PageReading } from "./pageReader";
import { PRAYER_KEYS, type Where, type Ymd } from "./types";

const TODAY = ymd(2026, 9, 20);
const WATERLOO: Where = { lat: 43.4643, lon: -80.5204, utcOffsetHours: -4 }; // Eastern Daylight Time, whatever runs this
const GOOD = "06:15 13:45 17:45 19:28 21:00";

const read = (html: string, today: Ymd = TODAY, where: Where | null = WATERLOO): PageReading | null =>
  extractIqama(html, { today, where });
const times = (found: PageReading | null): string => (found ? PRAYER_KEYS.map((p) => found.times[p]).join(" ") : "nothing");
const page = (body: string): string => `<html><head><title>A Masjid</title></head><body>${body}</body></html>`;
const rows = (make: (row: string[]) => string, data: string[][]): string => data.map(make).join("");

describe("layouts that are read", () => {
  it("one line to a prayer, the iqama labelled", () => {
    const found = read(
      page(
        "<p>Fajr 5:49 AM Iqama: 6:15 AM</p><p>Dhuhr 1:16 PM Iqama: 1:45 PM</p><p>Asr 5:34 PM Iqama: 5:45 PM</p>" +
          "<p>Maghrib 7:24 PM Iqama: 7:28 PM</p><p>Isha 8:43 PM Iqama: 9:00 PM</p>"
      )
    );
    assert.equal(times(found), GOOD);
    assert.equal(found?.how, "labelled"); // the surest kind of reading
  });

  it("a stack of divs, adhan and iqama labelled", () => {
    const stack = rows(
      ([n, a, i]) => `<div>${n}</div><div>Athan ${a}</div><div>Iqamah ${i}</div>`,
      [["Fajr", "5:49", "6:15"], ["Dhuhr", "1:16", "1:45"], ["Asr", "5:34", "5:45"], ["Maghrib", "7:24", "7:28"], ["Isha", "8:43", "9:00"]]
    );
    assert.equal(times(read(page(stack))), GOOD);
  });

  it("a table whose columns are named in a header", () => {
    const table =
      "<table><tr><th></th><th>Begins</th><th>Iqamah</th></tr>" +
      rows(([n, a, i]) => `<tr><td>${n}</td><td>${a}</td><td>${i}</td></tr>`, [
        ["Fajr", "5:49 am", "6:15 am"], ["Dhuhr", "1:16 pm", "1:45 pm"], ["Asr", "5:34 pm", "5:45 pm"],
        ["Maghrib", "7:24 pm", "7:28 pm"], ["Isha", "8:43 pm", "9:00 pm"],
      ]) +
      "</table>";
    const found = read(page(table));
    assert.equal(times(found), GOOD);
    assert.equal(found?.how, "headed");
  });

  it("the iqama first and the adhan labelled after it", () => {
    const html = page(
      rows(([n, i, a]) => `<p>${n} ${i} ATHAN: ${a}</p>`, [
        ["FAJR", "6:15 AM", "05:49 AM"], ["DHUHR", "1:45 PM", "01:16 PM"], ["ASR", "5:45 PM", "05:34 PM"],
        ["MAGHRIB", "7:28 PM", "07:24 PM"], ["ISHA", "9:00 PM", "08:43 PM"],
      ])
    );
    assert.equal(times(read(html)), GOOD);
  });

  it("a label with the time straight after its colon", () => {
    const html = page(
      rows(([n, i, a]) => `<p>${n} ${i} ATHAN:${a}</p>`, [
        ["FAJR", "6:15 AM", "05:49 AM"], ["DHUHR", "1:45 PM", "01:16 PM"], ["ASR", "5:45 PM", "05:34 PM"],
        ["MAGHRIB", "7:28 PM", "07:24 PM"], ["ISHA", "9:00 PM", "08:43 PM"],
      ])
    );
    const found = read(html);
    assert.equal(times(found), GOOD);
    assert.equal(found?.how, "labelled"); // the adhan was seen, so both were labelled
  });

  it("a time drawn as two elements, the hour and then the minutes, is one time", () => {
    const one = (n: string, h1: string, m1: string, h2: string, m2: string, ap: string): string =>
      `<div>${n}</div><div>${h1}</div><div>${m1} ${ap}</div><div>Iqamah</div><div>${h2}</div><div>${m2} ${ap}</div>`;
    const html = page(
      one("Fajr", "5", "49", "6", "15", "AM") +
        one("Dhuhr", "1", "16", "1", "45", "PM") +
        one("Asr", "5", "34", "5", "45", "PM") +
        one("Maghrib", "7", "24", "7", "28", "PM") +
        one("Isha", "8", "43", "9", "00", "PM")
    );
    assert.equal(times(read(html)), GOOD);
  });

  it("but a number on its own and a number on the next line are not always a time", () => {
    assert.deepEqual(flatten("<div>5</div><div>48 people came</div><div>1</div><div>7</div>"), ["5", "48 people came", "1", "7"]);
  });

  it("prayers across the top and a row each for adhan and iqama", () => {
    const across =
      "<table><tr><td></td><td>Fajr</td><td>Dhuhr</td><td>Asr</td><td>Maghrib</td><td>Isha</td></tr>" +
      "<tr><td>Adhan</td><td>5:49</td><td>1:16</td><td>5:34</td><td>7:24</td><td>8:43</td></tr>" +
      "<tr><td>Iqama</td><td>6:15</td><td>1:45</td><td>5:45</td><td>7:28</td><td>9:00</td></tr></table>";
    assert.equal(times(read(page(across))), GOOD);
  });

  it("all the names, then all the times in the same order, with Maghrib as 'Sunset'", () => {
    const namesFirst =
      "<h2>Prayer timing September 11 to 20</h2><div>Fajar</div><div>Dhuhr</div><div>Asr</div>" +
      "<div>Maghrib</div><div>Isha'a</div><div>6:15 AM</div><div>1:45 PM</div><div>5:45 PM</div><div>Sunset</div><div>9:00 PM</div>";
    const found = read(page(namesFirst));
    const sun = sunToday(WATERLOO, TODAY)!;
    assert.ok(found);
    assert.equal(found.times.fajr, "06:15");
    assert.equal(found.times.isha, "21:00");
    assert.equal(found.times.maghrib, hhmm(Math.round(sun.sunset)));
    assert.deepEqual(found.computed, ["maghrib"]);
    assert.equal(found.maghribRule, "sunset");
  });

  it("one time each, Maghrib in words, Jumma after Isha ignored", () => {
    const words = page(
      "<h3>Salah timings from Sunday September 13th, 2026</h3><p>Fajr: 6:10 am</p><p>Zuhr: 1:50 pm</p>" +
        "<p>Asr: 6:00 pm</p><p>Magrib: 3 Minutes after sunset</p><p>Isha: 9:10 pm</p>" +
        "<h4>First Jumma Salat:</h4><p>Talk in English 1:20 pm</p><p>Arabic Khutba 1:40 pm</p>"
    );
    const found = read(words);
    const sun = sunToday(WATERLOO, TODAY)!;
    assert.ok(found);
    assert.equal(found.times.isha, "21:10");
    assert.equal(found.times.maghrib, hhmm(Math.round(sun.sunset) + 3));
    assert.equal(found.how, "guessed"); // only a guess, and said so
    assert.equal(found.maghribRule, "sunset+3");
  });

  it("says Maghrib as the rule the page gave it by, so that it can be kept: 'sunset + 5' and 'after adhan'", () => {
    const rows = (maghrib: string) =>
      page(["Fajr Iqama 6:15", "Dhuhr Iqama 1:45", "Asr Iqama 5:45", `Maghrib Iqama ${maghrib}`, "Isha Iqama 9:00"].map((l) => `<p>${l}</p>`).join(""));
    assert.equal(read(rows("Sunset + 5"))?.maghribRule, "sunset+5");
    assert.equal(read(rows("5 min after Adhan"))?.maghribRule, "sunset+6"); // the adhan follows the sun by a minute
    // a Maghrib that is a clock time has no rule
    assert.equal(read(rows("7:28"))?.maghribRule, undefined);
    assert.equal(read(rows("7:28"))?.times.maghrib, "19:28");
  });

  it("the Jumah spelling, and its Bayaan, end Isha's group", () => {
    const html = page(
      "<p>Fajr: 6:30 am</p><p>Zuhr: 2:00 pm</p><p>Asr: 6:00 pm</p><p>Maghrib: 7:29 pm</p><p>Isha: 9:00 pm</p>" +
        "<p>Jumah English Bayaan: 4:00 PM</p><p>Jumah Arabic Khutba: 4:15 pm</p><p>Today's prayer times</p>"
    );
    assert.notEqual(times(read(html)), "nothing");
  });

  it("a Sunset row among the five is not one of them", () => {
    const html = page(
      "<p>Iqamah times change on Monday 21 September</p><table><tr><th>Prayer</th><th>Begins</th><th>Adhan</th><th>Iqamah</th></tr>" +
        "<tr><td>Fajr</td><td>5:21 AM</td><td>6:00 AM</td><td>6:15 AM</td></tr>" +
        "<tr><td>Sunrise</td><td>6:59 AM</td></tr>" +
        "<tr><td>Dhuhr</td><td>1:08 PM</td><td>1:30 PM</td><td>1:35 PM</td></tr>" +
        "<tr><td>Asr</td><td>5:27 PM</td><td>6:10 PM</td><td>6:15 PM</td></tr>" +
        "<tr><td>Sunset</td><td>7:18 PM</td></tr>" +
        "<tr><td>Maghrib</td><td>7:20 PM</td><td>7:21 PM</td><td>7:22 PM</td></tr>" +
        "<tr><td>Isha</td><td>8:37 PM</td><td>9:10 PM</td><td>9:15 PM</td></tr></table>"
    );
    const found = read(html);
    assert.equal(times(found), "06:15 13:35 18:15 19:22 21:15");
    assert.equal(found?.validUntil, "2026-09-21"); // and it says when they change
  });
});

describe("a heading of three columns written on one line", () => {
  // The way a script-drawn table comes out -- Ajax's does: "Salah Start Azan Iqamah" over
  // "Fajr 5:44 am 06:00 AM 06:15 AM". "Start Azan" looks like one heading said twice, and it
  // is the row that says it is two. These are Ajax's numbers for Monday the 21st, so they are
  // read at Ajax on the 21st: put anywhere else the sun check refuses them, which is right.
  const AJAX: Where = { lat: 43.85, lon: -79.03, utcOffsetHours: -4 };
  const readAjax = (html: string): PageReading | null => read(html, ymd(2026, 9, 21), AJAX);
  const FIVE = "06:15 14:00 18:00 19:18 21:15";
  const ROWS3 = [
    ["Fajr", "5:44 am", "06:00 AM", "06:15 AM"], ["Sunrise", "7:02 am"], ["Zuhr", "1:11 pm", "01:45 PM", "02:00 PM"],
    ["Asr", "5:27 pm", "05:45 PM", "06:00 PM"], ["Maghrib", "7:15 PM", "07:16 PM", "07:18 PM"], ["Isha", "8:37 pm", "09:14 PM", "09:15 PM"],
  ];
  const ROWS2 = ROWS3.map((r) => (r.length > 2 ? [r[0], r[1], r[r.length - 1]] : r));
  const byLine = (head: string, data: string[][]): string => page(`<p>${head}</p>` + data.map((r) => `<p>${r.join(" ")}</p>`).join(""));

  it("a one-line heading of three columns over rows of three times is read as three", () => {
    const found = readAjax(byLine("Salah Start Azan Iqamah", ROWS3));
    assert.equal(times(found), FIVE);
    assert.equal(found?.how, "headed"); // the third the iqama, the second the call to prayer
  });

  it("whichever way 'azan' is spelt, and the iqama", () => {
    for (const word of ["Azan", "Adhan", "Athan", "Azaan"]) {
      assert.equal(times(readAjax(byLine(`Salah Start ${word} Iqamah`, ROWS3))), FIVE, word);
    }
    assert.equal(times(readAjax(byLine("Salah Begins Adhan Iqama", ROWS3))), FIVE);
  });

  it("in twenty-four-hour time too", () => {
    const rows24 = [["Fajr", "05:44", "06:00", "06:15"], ["Sunrise", "07:02"], ["Zuhr", "13:11", "13:45", "14:00"],
      ["Asr", "17:27", "17:45", "18:00"], ["Maghrib", "19:15", "19:16", "19:18"], ["Isha", "20:37", "21:14", "21:15"]];
    assert.equal(times(readAjax(byLine("Salah Start Azan Iqamah", rows24))), FIVE);
  });

  it("and when the block is on the page twice, as a desktop and a phone copy", () => {
    const twice = page(([["Salah Start Azan Iqamah"], ...ROWS3, ["Salah Start Azan Iqamah"], ...ROWS3]).map((r) => `<p>${r.join(" ")}</p>`).join(""));
    assert.equal(times(readAjax(twice)), FIVE);
  });

  it("rows of two times under the same heading are still two columns, the pair taken as one heading", () => {
    assert.equal(times(readAjax(byLine("Salah Start Azan Iqamah", ROWS2))), FIVE);
  });

  it("as they were when the heading is 'Athan / Adhan' and the row has two", () => {
    assert.equal(times(readAjax(byLine("Salah Athan / Adhan Iqamah", ROWS2))), FIVE);
  });

  it("three times under a heading that names none of them are still not guessed at, nor three with no heading", () => {
    assert.equal(readAjax(byLine("Prayer Times", ROWS3)), null);
    assert.equal(readAjax(page(ROWS3.map((r) => `<p>${r.join(" ")}</p>`).join(""))), null);
  });

  it("a row whose count fits neither reading is refused, not bent to fit", () => {
    const five = [["Fajr", "5:44 am", "06:00 AM", "06:10 AM", "06:15 AM"], ...ROWS3.slice(1)];
    assert.equal(readAjax(byLine("Salah Start Azan Iqamah", five)), null);
  });
});

describe("a widget's strip of day tabs", () => {
  // What Athan+/Masjidal serves, and the most common platform on Canadian mosque sites: today's
  // times under a week of tabs, each tab a line with its Hijri date beneath. Today's own tab sits
  // a dozen lines above the table, well past where a heading normally is.
  const tabs = (days: Array<[string, string]>): string =>
    days.map(([greg, hijri]) => `<div>${greg}</div><div>${hijri}</div>`).join("") + "<div>Previous Next</div>";
  const WEEK: Array<[string, string]> = [
    ["Sunday, Sep 20, 2026", "Rabi Al-Thani 9, 1448"],
    ["Monday, Sep 21, 2026", "Rabi Al-Thani 10, 1448"],
    ["Tuesday, Sep 22, 2026", "Rabi Al-Thani 11, 1448"],
    ["Wednesday, Sep 23, 2026", "Rabi Al-Thani 12, 1448"],
    ["Thursday, Sep 24, 2026", "Rabi Al-Thani 13, 1448"],
    ["Friday, Sep 25, 2026", "Rabi Al-Thani 14, 1448"],
    ["Saturday, Sep 26, 2026", "Rabi Al-Thani 15, 1448"],
  ];
  const widget = (days: Array<[string, string]>): string =>
    page(
      `<h3>PRAYER TIMINGS</h3>${tabs(days)}` +
        "<table><tr><td>First Name</td><td>STARTS</td><td>IQAMAH</td></tr>" +
        "<tr><td>Fajr</td><td>5:42 AM</td><td>6:15 AM</td></tr>" +
        "<tr><td>Sunrise</td><td>7:02 AM</td></tr>" +
        "<tr><td>Dhuhr</td><td>1:11 PM</td><td>1:45 PM</td></tr>" +
        "<tr><td>Asr</td><td>5:29 PM</td><td>5:45 PM</td></tr>" +
        "<tr><td>Maghrib</td><td>7:24 PM</td><td>7:28 PM</td></tr>" +
        "<tr><td>Isha</td><td>8:37 PM</td><td>9:00 PM</td></tr></table>" +
        "<div>Jumuah</div><div>1:30 PM</div><div>Jumuah 1</div><div>VIEW MONTHLY CALENDAR</div>"
    );

  it("is read as today's, however far up the strip today's own tab has been pushed", () => {
    const found = read(widget(WEEK));
    assert.equal(times(found), GOOD);
    assert.equal(found?.how, "headed");
  });

  it("is still read when the strip is short", () => {
    assert.equal(times(read(widget(WEEK.slice(0, 2)))), GOOD);
  });

  it("is refused when the whole strip is another month's: a widget left showing a stale week", () => {
    const august: Array<[string, string]> = [
      ["Sunday, Aug 16, 2026", "Safar 3, 1448"],
      ["Monday, Aug 17, 2026", "Safar 4, 1448"],
      ["Tuesday, Aug 18, 2026", "Safar 5, 1448"],
      ["Wednesday, Aug 19, 2026", "Safar 6, 1448"],
      ["Thursday, Aug 20, 2026", "Safar 7, 1448"],
      ["Friday, Aug 21, 2026", "Safar 8, 1448"],
      ["Saturday, Aug 22, 2026", "Safar 9, 1448"],
    ];
    assert.equal(read(widget(august)), null);
  });

  it("stops at anything that is not a day tab, rather than walking up the page for a date", () => {
    // Today's date sits above a barrier; below it, a strip left showing August. Crossing the
    // barrier to reach today would make a stale widget look current, so each barrier must stop it.
    const stale: Array<[string, string]> = [
      ["Wednesday, Aug 19, 2026", "Safar 6, 1448"],
      ["Thursday, Aug 20, 2026", "Safar 7, 1448"],
      ["Friday, Aug 21, 2026", "Safar 8, 1448"],
    ];
    const barriers: Array<[string, string]> = [
      ["a line with a time in it", "<div>Office hours 9:00 AM</div>"],
      ["a line naming a prayer", "<div>Fajr</div>"],
      ["a run of lines with no date in them", "<div>Home</div><div>About</div><div>Donate</div><div>Contact</div>"],
      ["a long line of prose", "<p>Our annual fundraising dinner is on the last Saturday of the month and all are welcome.</p>"],
    ];
    for (const [what, barrier] of barriers) {
      const html = page(
        "<div>Sunday, Sep 20, 2026</div>" + barrier + tabs(stale) +
          "<table><tr><td></td><td>STARTS</td><td>IQAMAH</td></tr>" +
          "<tr><td>Fajr</td><td>5:42 AM</td><td>6:15 AM</td></tr><tr><td>Dhuhr</td><td>1:11 PM</td><td>1:45 PM</td></tr>" +
          "<tr><td>Asr</td><td>5:29 PM</td><td>5:45 PM</td></tr><tr><td>Maghrib</td><td>7:24 PM</td><td>7:28 PM</td></tr>" +
          "<tr><td>Isha</td><td>8:37 PM</td><td>9:00 PM</td></tr></table>"
      );
      assert.equal(read(html), null, `it walked back over ${what}`);
    }
  });

  it("does not walk back over prose, a time, or another prayer to reach a date", () => {
    const far = page(
      "<p>Sunday, Sep 20, 2026</p>" +
        "<p>Our annual fundraising dinner is on the last Saturday of every month, and all are welcome to attend.</p>" +
        tabs(WEEK.slice(3)) +
        "<table><tr><td></td><td>STARTS</td><td>IQAMAH</td></tr>" +
        "<tr><td>Fajr</td><td>5:42 AM</td><td>6:15 AM</td></tr><tr><td>Dhuhr</td><td>1:11 PM</td><td>1:45 PM</td></tr>" +
        "<tr><td>Asr</td><td>5:29 PM</td><td>5:45 PM</td></tr><tr><td>Maghrib</td><td>7:24 PM</td><td>7:28 PM</td></tr>" +
        "<tr><td>Isha</td><td>8:37 PM</td><td>9:00 PM</td></tr></table>"
    );
    assert.equal(read(far), null); // the paragraph stops the walk, so only Wednesday..Saturday are seen
  });
});

describe("which day the times are for", () => {
  const listing = (data: Array<[string, string]>): string => data.map(([n, t]) => `<p>${n} Iqama ${t}</p>`).join("");
  const board = listing([["Fajr", "6:15"], ["Dhuhr", "1:45"], ["Asr", "5:45"], ["Maghrib", "7:28"], ["Isha", "9:00"]]);

  it("of two different sets, the one that says today", () => {
    const html = page(
      "<h3>Today's prayer times</h3>" + board +
        "<h3>Next week</h3>" + listing([["Fajr", "6:30"], ["Dhuhr", "1:30"], ["Asr", "5:15"], ["Maghrib", "7:10"], ["Isha", "8:45"]])
    );
    assert.equal(times(read(html)), GOOD);
  });

  it("two different sets and nothing to choose between them is not guessed at", () => {
    const html = page(
      "<p>Men</p>" + board + "<p>Women</p>" +
        listing([["Fajr", "6:30"], ["Dhuhr", "2:00"], ["Asr", "6:00"], ["Maghrib", "7:30"], ["Isha", "9:15"]])
    );
    assert.equal(read(html), null);
  });

  const week = page(
    [
      ["Saturday, September 19, 2026", [["Fajr", "6:10"], ["Dhuhr", "1:40"], ["Asr", "5:40"], ["Maghrib", "7:30"], ["Isha", "8:55"]]],
      ["Sunday, September 20, 2026", [["Fajr", "6:15"], ["Dhuhr", "1:45"], ["Asr", "5:45"], ["Maghrib", "7:28"], ["Isha", "9:00"]]],
      ["Monday, September 21, 2026", [["Fajr", "6:20"], ["Dhuhr", "1:50"], ["Asr", "5:50"], ["Maghrib", "7:26"], ["Isha", "9:05"]]],
    ]
      .map(([day, data]) => `<h4>${day as string}</h4>${listing(data as Array<[string, string]>)}`)
      .join("")
  );

  it("a week of days: the one headed with today's date", () => {
    assert.equal(times(read(week)), GOOD);
  });

  it("and a page whose days are all past says nothing", () => {
    assert.equal(read(week, ymd(2026, 9, 27)), null);
  });

  it("a board dated three days ago is not today's", () => {
    assert.equal(read(page("<h4>Thursday, Sep 17, 2026</h4>" + board)), null);
  });

  it("'from' a date in the past: in force until changed", () => {
    assert.equal(times(read(page("<p>Timings from Sunday September 13th</p>" + board))), GOOD);
  });

  it("'from' a date to come: not in force yet", () => {
    assert.equal(read(page("<p>Timings from Monday September 28th</p>" + board)), null);
  });

  it("'changes on' a date to come: still in force", () => {
    assert.equal(times(read(page("<p>Iqamah times change on Monday 21 September</p>" + board))), GOOD);
  });

  it("'changes on' a date gone by: out of date", () => {
    assert.equal(read(page("<p>Iqamah times change on Monday 14 September</p>" + board)), null);
  });

  it("a range of days that includes today", () => {
    assert.equal(times(read(page("<p>Prayer timing September 11 to 20</p>" + board))), GOOD);
  });

  it("a range that ended", () => {
    assert.equal(read(page("<p>Prayer timing September 1 to 10</p>" + board)), null);
  });

  it("an announcement's date on the page is not the timetable's", () => {
    const html = page("<p>Eid prayers will be held at 10:30am on Wednesday the 27th May, 2026 insha'Allah! Please come early.</p>" + board);
    assert.equal(times(read(html)), GOOD);
  });

  it("'September 2026' is a month, not the 20th", () => {
    assert.equal(times(read(page("<h3>Prayer Times September 2026</h3>" + board))), GOOD);
  });

  it("dates across the new year are the nearest ones", () => {
    // January's own timetable, so the sun agrees; a page that says "from December 28th" on
    // January 2nd means last month's 28th, not next year's.
    const winter = listing([["Fajr", "6:30"], ["Dhuhr", "1:15"], ["Asr", "3:00"], ["Maghrib", "5:00"], ["Isha", "6:30"]]);
    const eastern = { ...WATERLOO, utcOffsetHours: -5 };
    const html = page("<p>Timings from Sunday December 28th</p>" + winter);
    assert.equal(times(read(html, ymd(2027, 1, 2), eastern)), "06:30 13:15 15:00 17:00 18:30");
    assert.equal(read(page("<p>Timings from Sunday January 28th</p>" + winter), ymd(2027, 1, 2), eastern), null);
  });
});

describe("pages that must not be read", () => {
  it("a list of start times under 'For Current Iqama Times Select ...' is the city's prayer times, not an iqama column", () => {
    // One Vancouver association's home page: the iqama times need a branch chosen, and what is printed is the
    // city's start times (Fajr 5:09 is first light). Counting the instruction as a heading read them as iqamas.
    const vancouver: Where = { lat: 49.28, lon: -123.12, utcOffsetHours: -7 };
    const list = (line: string): string =>
      page(
        `<h3>Salah Times</h3><div>Show Prayer Times for:</div><div>${line}</div><div>Your Local Branch e.g. Richmond</div>` +
          "<div>Fajr</div><div>5:09 AM</div><div>Sunrise</div><div>6:55 AM</div><div>Zuhr</div><div>1:15 PM</div><div>Asr</div><div>5:17 PM</div>" +
          "<div>Maghrib</div><div>7:18 PM</div><div>Isha</div><div>8:41 PM</div>"
      );
    // each kind of instruction, on its own
    for (const pointer of [
      "For Current Iqama Times Select",
      "Select your branch for iqama times",
      "Choose a branch for iqama times",
      "Click here for the iqama times",
      "Tap for iqama times",
      "Press for iqama times",
      "Download the iqama times",
      "Subscribe for iqama times",
      "Confirm the iqama times",
      "Visit us for iqama times",
      "Contact the masjid for iqama",
      "For current iqama times see below",
      "For the latest iqamah times",
      "For updated iqama times",
    ]) {
      assert.equal(read(list(pointer), TODAY, vancouver), null, pointer);
    }
    // the same list under an actual heading is what it says it is, and a heading that only mentions the week is one
    for (const heading of ["Iqama", "Iqamah Times", "Iqama Times for Current Week", "Jamaat (Iqama) Timings"]) {
      assert.equal(times(read(list(heading), TODAY, vancouver)), "05:09 13:15 17:17 19:18 20:41", heading);
    }
  });

  it("a template of adhan times on the hour and half hour", () => {
    // Times a mosque could keep on a September day: it is the round adhan times, and nothing about
    // the season, that says this is a template still waiting for its numbers.
    const template =
      "<table><tr><td></td><td>Fajr</td><td>Dhuhr</td><td>Asr</td><td>Maghrib</td><td>Isha</td></tr>" +
      "<tr><td>Adhan</td><td>5:30</td><td>1:00</td><td>5:00</td><td>7:30</td><td>9:00</td></tr>" +
      "<tr><td>Iqama</td><td>6:00</td><td>1:30</td><td>5:30</td><td>7:35</td><td>9:30</td></tr></table>";
    assert.equal(read(page(template)), null);
    // and the same table with real adhan times is a timetable
    const real = template.replace("5:30</td><td>1:00</td><td>5:00</td><td>7:30</td><td>9:00", "5:49</td><td>1:16</td><td>5:14</td><td>7:24</td><td>8:43");
    assert.notEqual(read(page(real)), null);
  });

  const june = page(
    rows(([n, a, i]) => `<p>${n} Athan ${a} Iqama ${i}</p>`, [
      ["Fajr", "3:35 AM", "4:00 AM"], ["Dhuhr", "1:16 PM", "1:45 PM"], ["Asr", "5:34 PM", "6:15 PM"],
      ["Maghrib", "9:00 PM", "9:10 PM"], ["Isha", "10:30 PM", "10:45 PM"],
    ])
  );

  it("a June timetable on a September page, well-formed in every other way", () => {
    assert.equal(read(june), null);
  });

  it("but the same page in June is fine", () => {
    assert.notEqual(read(june, ymd(2026, 6, 21)), null);
  });

  it("and without a position there is no sun to check against, so it is not refused for that", () => {
    assert.notEqual(read(june, TODAY, null), null);
  });

  it("times a script fills in later are placeholders, not times", () => {
    assert.equal(read(page(PRAYER_KEYS.map((n) => `<div>${n}</div><div>12:00 am</div><div>12:00 am</div>`).join(""))), null);
  });

  it("and so are unfilled template tags", () => {
    assert.equal(read(page(PRAYER_KEYS.map((n) => `<div>${n}</div><div>[${n}_start]</div>`).join(""))), null);
  });

  it("start times alone, none of them round, are not the congregation's", () => {
    const html = page(
      rows(([n, t]) => `<p>${n} ${t}</p>`, [["Fajr", "5:49 AM"], ["Dhuhr", "1:16 PM"], ["Asr", "5:34 PM"], ["Maghrib", "7:24 PM"], ["Isha", "8:43 PM"]])
    );
    assert.equal(read(html), null);
  });

  it("an iqama before its own adhan is a column misread", () => {
    const html = page(
      rows(([n, a, i]) => `<p>${n} Athan ${a} Iqamah ${i}</p>`, [
        ["Fajr", "6:15", "5:49"], ["Dhuhr", "1:45", "1:16"], ["Asr", "5:45", "5:34"], ["Maghrib", "7:28", "7:24"], ["Isha", "9:00", "8:43"],
      ])
    );
    assert.equal(read(html), null);
  });

  it("prayers out of order are not a timetable", () => {
    const html = page(rows(([n, t]) => `<p>${n} Iqama ${t}</p>`, [["Fajr", "6:15"], ["Dhuhr", "5:45"], ["Asr", "1:45"], ["Maghrib", "7:28"], ["Isha", "9:00"]]));
    assert.equal(read(html), null);
  });

  it("Fajr before the first light of the day cannot be Fajr", () => {
    const html = page(
      rows(([n, a, i]) => `<p>${n} Athan ${a} Iqama ${i}</p>`, [
        ["Fajr", "4:00 AM", "4:30 AM"], ["Dhuhr", "1:16 PM", "1:45 PM"], ["Asr", "5:34 PM", "5:45 PM"],
        ["Maghrib", "7:24 PM", "7:28 PM"], ["Isha", "8:43 PM", "9:00 PM"],
      ])
    );
    assert.equal(read(html), null);
  });

  it("a page that is not about prayer at all", () => {
    assert.equal(read(page("<h1>Welcome</h1><p>Classes at 5:30 pm on Fridays.</p>")), null);
  });

  it("hidden text is not read", () => {
    const board = PRAYER_KEYS.map((n, i) => `<p>${n} Iqama ${["6:15", "1:45", "5:45", "7:28", "9:00"][i]}</p>`).join("");
    assert.equal(read(page(`<div style="display:none">${board}</div>`)), null);
  });
});

describe("reading a page", () => {
  it("names the page, unescaped", () => {
    assert.equal(pageTitle("<html><head><title> Al&nbsp;Noor &amp; Co\n Masjid </title></head></html>"), "Al Noor & Co Masjid");
  });

  it("finds where the page says the mosque is, and uses it for the sun", () => {
    const board = PRAYER_KEYS.map((n, i) => `<p>${n} Athan ${["5:49 AM", "1:16 PM", "5:34 PM", "9:00 PM", "10:30 PM"][i]} Iqama ${["6:15 AM", "1:45 PM", "6:15 PM", "9:10 PM", "10:45 PM"][i]}</p>`).join("");
    const withPosition = `<script type="application/ld+json">{"latitude": 43.46, "longitude": -80.52}</script>` + board;
    assert.equal(read(page(withPosition), TODAY, null), null); // June's Maghrib, and it knew where from the page
    assert.notEqual(read(page(board), TODAY, null), null); // the same table knowing nothing of where
  });
});

describe("links and addresses", () => {
  it("resolves relative links", () => {
    const base = "https://masjid.example/dir/page.html?x=1";
    assert.equal(resolveUrl("/prayer-times", base), "https://masjid.example/prayer-times");
    assert.equal(resolveUrl("times/", base), "https://masjid.example/dir/times/");
    assert.equal(resolveUrl("../up", base), "https://masjid.example/up");
    assert.equal(resolveUrl("//cdn.example/x", base), "https://cdn.example/x");
    assert.equal(resolveUrl("https://other.example/a", base), "https://other.example/a");
    assert.equal(resolveUrl("?a=2", base), "https://masjid.example/dir/page.html?a=2");
    assert.equal(resolveUrl("../../../../x", base), "https://masjid.example/x");
  });

  it("follows a page called prayer times, a widget frame, and not much else", () => {
    const { subpages, frames } = pageLinks(
      '<a href="/prayer-times">Prayer times</a><a href="/donate">Donate</a><a href="/about">About</a>' +
        '<a href="https://other.example/prayer-times">Elsewhere</a><a href="/files/timetable.pdf">PDF</a>' +
        '<iframe src="https://widget.example/times"></iframe>' +
        '<iframe src="https://mawaqit.net/en/w/some-masjid"></iframe>' +
        '<iframe src="https://www.youtube.com/embed/x"></iframe>',
      "https://masjid.example/"
    );
    assert.deepEqual(subpages, ["https://masjid.example/prayer-times"]);
    assert.deepEqual(frames, ["https://widget.example/times"]); // MAWAQIT is left to its own reader
  });
});
