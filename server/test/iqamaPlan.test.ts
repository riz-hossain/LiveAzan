import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maghribTime, sunToday, ymd, type IqamaReading } from "@live-azan/shared";
import { planSchedules, resolveTimes, type OpenRow } from "../src/services/iqamaPlan";

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

describe("what to write", () => {
  const stored = (over: Partial<Record<string, string>> = {}): OpenRow[] =>
    (["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA"] as const).map((prayer, i) => ({
      id: `row${i}`,
      prayer,
      iqamaTime: over[prayer] ?? Object.values(TIMES)[i],
    }));

  it("adds all five for a mosque with nothing stored", () => {
    const plan = planSchedules(reading(), []);
    assert.deepEqual(plan.close, []);
    assert.deepEqual(plan.add.map((row) => row.prayer), ["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA"]);
    assert.equal(plan.add[0].iqamaTime, "06:15");
  });

  it("writes nothing when nothing has changed: a weekly run must not grow the table", () => {
    const plan = planSchedules(reading(), stored());
    assert.deepEqual(plan.close, []);
    assert.deepEqual(plan.add, []);
    assert.equal(plan.found.length, 5);
  });

  it("closes and replaces only the time that changed", () => {
    const plan = planSchedules(reading(), stored({ FAJR: "05:45" }));
    assert.deepEqual(plan.close, ["row0"]);
    assert.deepEqual(plan.add, [{ prayer: "FAJR", iqamaTime: "06:15" }]);
  });

  it("replaces a stored rule such as sunset+5 with the time worked out", () => {
    const plan = planSchedules(reading(), stored({ MAGHRIB: "sunset+5" }));
    assert.deepEqual(plan.close, ["row3"]);
    assert.deepEqual(plan.add, [{ prayer: "MAGHRIB", iqamaTime: "19:28" }]);
  });

  it("stores a Maghrib the page gave as a rule as that rule, and does not rewrite it when it is unchanged", () => {
    const computed = reading({ computed: ["maghrib"], maghribRule: "sunset+5" });
    const fresh = planSchedules(computed, []);
    assert.deepEqual(fresh.add.find((row) => row.prayer === "MAGHRIB"), { prayer: "MAGHRIB", iqamaTime: "sunset+5" });
    const settled = planSchedules(computed, stored({ MAGHRIB: "sunset+5" }));
    assert.deepEqual(settled.close, []);
    assert.deepEqual(settled.add, []);
    // a rule that has changed is a change
    const later = planSchedules(reading({ computed: ["maghrib"], maghribRule: "sunset+8" }), stored({ MAGHRIB: "sunset+5" }));
    assert.deepEqual(later.add, [{ prayer: "MAGHRIB", iqamaTime: "sunset+8" }]);
  });

  it("collapses a prayer that has two open rows, as the old job left them", () => {
    const open = [...stored(), { id: "dup", prayer: "ASR" as const, iqamaTime: "17:45" }];
    const plan = planSchedules(reading(), open);
    assert.deepEqual(plan.close.sort(), ["dup", "row2"]);
    assert.deepEqual(plan.add, [{ prayer: "ASR", iqamaTime: "17:45" }]);
  });

  it("adds Jumu'ah when the reading has it, and does not close it when a later reading does not", () => {
    const withJumuah = planSchedules(reading({ jumuah: "13:30" }), stored());
    assert.deepEqual(withJumuah.add, [{ prayer: "JUMMAH", iqamaTime: "13:30" }]);
    const later = planSchedules(reading(), [...stored(), { id: "j", prayer: "JUMMAH", iqamaTime: "13:30" }]);
    assert.deepEqual(later.close, []);
    assert.deepEqual(later.add, []);
  });
});

describe("times as the app can use them", () => {
  const waterloo = { latitude: 43.4643, longitude: -80.5204, province: "Ontario", country: "Canada" };
  const row = (prayer: string, iqamaTime: string) => ({ id: prayer, prayer, iqamaTime, mosqueId: "m" });
  const on = new Date(Date.UTC(2026, 8, 20, 15));

  it("passes clock times through, written the same way", () => {
    const got = resolveTimes([row("FAJR", "6:15"), row("ISHA", "21:00")], waterloo, on);
    assert.deepEqual(got.map((r) => r.iqamaTime), ["06:15", "21:00"]);
  });

  it("works a stored 'sunset+5' out for today at the mosque, so it is a time and moves with the year", () => {
    const [september] = resolveTimes([row("MAGHRIB", "sunset+5")], waterloo, on);
    const expected = maghribTime("sunset+5", { lat: 43.4643, lon: -80.5204, utcOffsetHours: -4 }, ymd(2026, 9, 20));
    assert.equal(september.iqamaTime, expected);
    assert.match(september.iqamaTime, /^19:2\d$/);
    assert.equal(september.id, "MAGHRIB");
    const [december] = resolveTimes([row("MAGHRIB", "sunset+5")], waterloo, new Date(Date.UTC(2026, 11, 21, 15)));
    assert.ok(december.iqamaTime < "17:00", december.iqamaTime);
    assert.ok(sunToday({ lat: 43.4643, lon: -80.5204, utcOffsetHours: -5 }, ymd(2026, 12, 21)));
  });

  it("leaves out what is neither a time nor a rule the app can be given, rather than send text a countdown cannot read", () => {
    const got = resolveTimes([row("FAJR", "after Isha"), row("DHUHR", "sunset+5"), row("MAGHRIB", "whenever"), row("ASR", "17:45")], waterloo, on);
    assert.deepEqual(got.map((r) => r.prayer), ["ASR"]);
  });

  it("works it out on the mosque's own day, not the server's", () => {
    const vancouver = { latitude: 49.28, longitude: -123.12, province: "British Columbia", country: "Canada" };
    const evening = new Date(Date.UTC(2026, 8, 21, 2, 0, 0)); // the 21st in Greenwich, the evening of the 20th at the mosque
    const [got] = resolveTimes([row("MAGHRIB", "sunset+5")], vancouver, evening);
    const expected = maghribTime("sunset+5", { lat: 49.28, lon: -123.12, utcOffsetHours: -7 }, ymd(2026, 9, 20));
    assert.equal(got.iqamaTime, expected);
  });
});
