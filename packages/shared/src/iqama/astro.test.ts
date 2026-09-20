import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADHAN_AFTER_SUNSET, checkAgainstSun, maghribFromWords, sunToday } from "./astro";
import {
  addDays,
  daysBetween,
  hhmm,
  isFriday,
  isoDate,
  isValidYmd,
  mosqueDay,
  offsetHoursForZone,
  parseClock,
  parseIsoDate,
  todayInZone,
  weekday,
  ymd,
  zoneForPlace,
} from "./clock";

const hm = (minutes: number): string => hhmm(minutes);

describe("calendar days", () => {
  it("counts and steps across month and year ends", () => {
    assert.equal(daysBetween(ymd(2026, 9, 20), ymd(2026, 9, 27)), 7);
    assert.deepEqual(addDays(ymd(2026, 12, 31), 1), ymd(2027, 1, 1));
    assert.deepEqual(addDays(ymd(2026, 3, 1), -1), ymd(2026, 2, 28));
    assert.equal(isoDate(ymd(2026, 9, 5)), "2026-09-05");
  });

  it("knows the day of the week", () => {
    assert.equal(weekday(ymd(2026, 9, 20)), 0); // a Sunday
    assert.equal(isFriday(ymd(2026, 9, 18)), true);
    assert.equal(isFriday(ymd(2026, 9, 19)), false);
  });

  it("refuses days that do not exist", () => {
    assert.equal(isValidYmd(2026, 2, 29), false);
    assert.equal(isValidYmd(2028, 2, 29), true);
    assert.equal(isValidYmd(2026, 13, 1), false);
    assert.equal(parseIsoDate("2026-09-20T00:00:00Z")?.day, 20);
    assert.equal(parseIsoDate("soon"), null);
  });
});

describe("clock times", () => {
  it("formats minutes as 24-hour times, wrapping past midnight", () => {
    assert.equal(hhmm(375), "06:15");
    assert.equal(hhmm(1475), "00:35");
    assert.equal(hhmm(-5), "23:55");
  });

  it("reads 24-hour times and nothing else", () => {
    assert.equal(parseClock("6:15"), 375);
    assert.equal(parseClock("06:15:00"), 375);
    assert.equal(parseClock("24:10"), null);
    assert.equal(parseClock("+10"), null);
    assert.equal(parseClock(undefined), null);
  });
});

describe("time zones", () => {
  it("knows what day it is where the mosque is, not where the server is", () => {
    const at = new Date(Date.UTC(2026, 8, 21, 2, 0, 0)); // 02:00 in Greenwich on the 21st
    assert.deepEqual(todayInZone("America/Vancouver", at), ymd(2026, 9, 20)); // still the evening of the 20th there
    assert.deepEqual(todayInZone("Europe/London", at), ymd(2026, 9, 21));
    assert.deepEqual(todayInZone("Mars/Olympus", at), todayInZone(undefined, at)); // no zone, this device's day
  });

  it("gives a zone's offset with daylight time in it", () => {
    assert.equal(offsetHoursForZone(ymd(2026, 9, 20), "America/Toronto"), -4);
    assert.equal(offsetHoursForZone(ymd(2026, 1, 15), "America/Toronto"), -5);
    assert.equal(offsetHoursForZone(ymd(2026, 9, 20), "America/Regina"), -6);
    assert.equal(offsetHoursForZone(ymd(2026, 1, 15), "America/Regina"), -6);
    assert.equal(offsetHoursForZone(ymd(2026, 9, 20), "America/St_Johns"), -2.5);
    assert.equal(offsetHoursForZone(ymd(2026, 6, 21), "America/Edmonton"), -6);
  });

  it("says nothing for a zone it has never heard of", () => {
    assert.equal(offsetHoursForZone(ymd(2026, 9, 20), "Mars/Olympus"), undefined);
  });

  it("finds a Canadian mosque's zone from its province", () => {
    assert.equal(zoneForPlace({ province: "Ontario", longitude: -80.5 }), "America/Toronto");
    assert.equal(zoneForPlace({ province: "Ontario", longitude: -94.4 }), "America/Winnipeg");
    assert.equal(zoneForPlace({ province: "Alberta" }), "America/Edmonton");
    assert.equal(zoneForPlace({ province: "British Columbia" }), "America/Vancouver");
    assert.equal(zoneForPlace({ province: "Nova Scotia" }), "America/Halifax");
    assert.equal(zoneForPlace({ province: "QC", country: "Canada" }), "America/Toronto");
  });

  it("gives a mosque's day and place as the reader wants them, on the mosque's wall and not the phone's", () => {
    const earlier = process.env.TZ;
    process.env.TZ = "Asia/Tokyo"; // where it is already the morning of the 21st
    try {
      const vancouver = { latitude: 49.28, longitude: -123.12, province: "British Columbia", country: "Canada" };
      const got = mosqueDay(vancouver, new Date(Date.UTC(2026, 8, 21, 2, 0, 0)));
      assert.deepEqual(got.today, ymd(2026, 9, 20));
      assert.deepEqual(got.where, { lat: 49.28, lon: -123.12, utcOffsetHours: -7 });
    } finally {
      if (earlier === undefined) delete process.env.TZ;
      else process.env.TZ = earlier;
    }
  });

  it("knows Ontario's offset with daylight time in it, and asks nothing of a mosque elsewhere", () => {
    const waterloo = { latitude: 43.4643, longitude: -80.5204, province: "Ontario", country: "Canada" };
    assert.equal(mosqueDay(waterloo, new Date(Date.UTC(2026, 8, 20, 15))).where.utcOffsetHours, -4);
    assert.equal(mosqueDay(waterloo, new Date(Date.UTC(2026, 0, 20, 15))).where.utcOffsetHours, -5);
    const elsewhere = mosqueDay({ latitude: 48.1, longitude: -1.7, province: "Bretagne", country: "France" }, new Date(Date.UTC(2026, 8, 20, 15)));
    assert.equal("utcOffsetHours" in elsewhere.where, false);
    assert.equal(mosqueDay({ latitude: 1, longitude: 2, province: null, country: null }).where.lat, 1);
  });

  it("does not guess for anywhere else", () => {
    assert.equal(zoneForPlace({ province: "Ontario", country: "United States" }), undefined);
    assert.equal(zoneForPlace({ province: "Bavaria", country: "Germany" }), undefined);
    assert.equal(zoneForPlace({}), undefined);
  });
});

describe("the sun", () => {
  it("gives New York's longest day: sunrise about 5:25 and sunset about 8:31", () => {
    const sun = sunToday({ lat: 40.7128, lon: -74.006, utcOffsetHours: -4 }, ymd(2026, 6, 21));
    assert.ok(sun);
    assert.ok(Math.abs(sun.sunrise - (5 * 60 + 25)) <= 3, hm(sun.sunrise));
    assert.ok(Math.abs(sun.sunset - (20 * 60 + 31)) <= 3, hm(sun.sunset));
  });

  it("gives London's shortest: sunrise about 8:04 and sunset about 3:53", () => {
    const sun = sunToday({ lat: 51.5074, lon: -0.1278, utcOffsetHours: 0 }, ymd(2026, 12, 21));
    assert.ok(sun);
    assert.ok(Math.abs(sun.sunrise - (8 * 60 + 4)) <= 3, hm(sun.sunrise));
    assert.ok(Math.abs(sun.sunset - (15 * 60 + 53)) <= 3, hm(sun.sunset));
  });

  it("has no sunrise at all above the arctic circle in midwinter", () => {
    assert.equal(sunToday({ lat: 78, lon: 15, utcOffsetHours: 1 }, ymd(2026, 12, 21)), null);
  });

  it("does not answer for a place it was not made for", () => {
    assert.equal(sunToday({ lat: 80, lon: 0, utcOffsetHours: 0 }, ymd(2026, 9, 20)), null);
    assert.equal(sunToday({ lat: Number.NaN, lon: 0, utcOffsetHours: 0 }, ymd(2026, 9, 20)), null);
  });

  it("puts first light well before sunrise in September, and never in a northern summer", () => {
    const waterloo = sunToday({ lat: 43.46, lon: -80.52, utcOffsetHours: -4 }, ymd(2026, 9, 20));
    assert.ok(waterloo && waterloo.dawn !== null);
    assert.ok(waterloo.sunrise - waterloo.dawn > 90);
    const edmonton = sunToday({ lat: 53.5, lon: -113.5, utcOffsetHours: -6 }, ymd(2026, 6, 21));
    assert.ok(edmonton);
    assert.equal(edmonton.dawn, null);
  });

  it("uses the mosque's own offset, not the phone's", () => {
    const eastern = sunToday({ lat: 43.4643, lon: -80.5204, utcOffsetHours: -4 }, ymd(2026, 9, 20));
    const central = sunToday({ lat: 43.4643, lon: -80.5204, utcOffsetHours: -6 }, ymd(2026, 9, 20));
    assert.ok(eastern && central);
    assert.ok(central.noon < eastern.noon - 100);
  });
});

describe("Maghrib written as words", () => {
  const sunset = 19 * 60 + 23;
  it("reads 'sunset' and what is added to it", () => {
    assert.equal(maghribFromWords("Maghrib: Sunset", sunset), sunset);
    assert.equal(maghribFromWords("3 Minutes after sunset", sunset), sunset + 3);
    assert.equal(maghribFromWords("Sunset + 5", sunset), sunset + 5);
    assert.equal(maghribFromWords("Maghrib Sunset Iqama: +5 mins", sunset), sunset + 5);
  });

  it("counts from the adhan when it says after adhan", () => {
    assert.equal(maghribFromWords("5 min after Adhan", sunset), Math.round(sunset + ADHAN_AFTER_SUNSET + 5));
  });

  it("says nothing about a line that is not about Maghrib's timing", () => {
    assert.equal(maghribFromWords("7:28 PM", sunset), null);
    assert.equal(maghribFromWords("", sunset), null);
  });
});

describe("is this table the right season?", () => {
  const sun = sunToday({ lat: 43.4643, lon: -80.5204, utcOffsetHours: -4 }, ymd(2026, 9, 20));
  assert.ok(sun);
  const good = { fajr: 6 * 60 + 15, dhuhr: 13 * 60 + 45, asr: 17 * 60 + 45, maghrib: 19 * 60 + 28, isha: 21 * 60 };

  it("accepts a September timetable in September", () => {
    assert.equal(checkAgainstSun(good, sun), "");
  });

  it("refuses June's in September", () => {
    const june = { fajr: 4 * 60, dhuhr: 13 * 60 + 45, asr: 18 * 60 + 15, maghrib: 21 * 60 + 10, isha: 22 * 60 + 45 };
    assert.notEqual(checkAgainstSun(june, sun), "");
  });

  it("says which prayer, and why", () => {
    const message = checkAgainstSun({ ...good, maghrib: 21 * 60 + 10 }, sun);
    assert.match(message, /^Maghrib at 21:10 is not possible on this day here \(sunset is 19:2/);
  });

  it("refuses Fajr before first light and Fajr after sunrise", () => {
    assert.match(checkAgainstSun({ ...good, fajr: 4 * 60 + 30 }, sun), /^Fajr at 04:30/);
    assert.match(checkAgainstSun({ ...good, fajr: sun.sunrise - 2 }, sun), /^Fajr at /);
  });

  it("has no opinion without a sun", () => {
    assert.equal(checkAgainstSun({ maghrib: 3 * 60 }, null), "");
  });
});
