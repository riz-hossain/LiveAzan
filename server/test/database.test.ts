import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import type { FetchText } from "@live-azan/shared";

// These run against a real Postgres, which is where a mistake in a query or a route would show and where
// a fake store cannot. They are skipped unless TEST_DATABASE_URL names a database with the schema pushed
// (npx prisma db push): the rows they make are their own, and they remove them when done.
const url = process.env.TEST_DATABASE_URL;

const HOME = "https://masjid.example/";
const NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const page = (times: string[]): string =>
  `<html><head><title>A Masjid</title></head><body>${NAMES.map((n, i) => `<p>${n} Iqama ${times[i]}</p>`).join("")}</body></html>`;

let pages: Record<string, string> = {};
const fetchText: FetchText = async (address) => {
  const body = pages[address];
  return { url: address, status: body === undefined ? 404 : 200, contentType: "text/html", body: body ?? "" };
};

const NOW = new Date(Date.UTC(2026, 8, 20, 15)); // 11:00 in Toronto
const CLOCK = /^\d{2}:\d{2}$/;

describe("against a real database", { skip: url ? false : "set TEST_DATABASE_URL to run these" }, () => {
  const ID = `test-iqama-${process.pid}`;
  let db: typeof import("../src/lib/prisma").prisma;
  let enrichMosque: typeof import("../src/services/iqamaEnrichment").enrichMosque;
  let server: Server;
  let base = "";

  const rows = () => db.iqamaSchedule.findMany({ where: { mosqueId: ID }, orderBy: [{ prayer: "asc" }, { effectiveFrom: "asc" }] });
  const open = async () => (await rows()).filter((row) => row.effectiveTo === null);
  const get = async (path: string) => (await fetch(`${base}${path}`)).json() as Promise<any>;

  before(async () => {
    process.env.DATABASE_URL = url;
    ({ prisma: db } = await import("../src/lib/prisma"));
    ({ enrichMosque } = await import("../src/services/iqamaEnrichment"));
    const express = (await import("express")).default;
    const mosques = (await import("../src/routes/mosques")).default;
    const iqama = (await import("../src/routes/iqama")).default;
    const app = express();
    app.use("/api/mosques", mosques);
    app.use("/api/iqama", iqama);
    server = app.listen(0);
    base = `http://localhost:${(server.address() as AddressInfo).port}/api`;

    await db.mosque.create({
      data: { id: ID, name: "Test Masjid", address: "1 Main St", city: "Waterloo", province: "Ontario", country: "Canada", latitude: 43.4643, longitude: -80.5204, website: HOME },
    });
    // as the seed leaves a mosque: researched in March, Maghrib written as a rule
    const seeded: Array<["FAJR" | "DHUHR" | "ASR" | "MAGHRIB" | "ISHA", string]> = [["FAJR", "05:45"], ["DHUHR", "13:45"], ["ASR", "17:45"], ["MAGHRIB", "sunset+5"], ["ISHA", "21:00"]];
    for (const [prayer, iqamaTime] of seeded) {
      await db.iqamaSchedule.create({ data: { mosqueId: ID, prayer, iqamaTime, effectiveFrom: new Date("2026-03-15") } });
    }
  });

  after(async () => {
    server?.close();
    await db?.mosque.delete({ where: { id: ID } }).catch(() => undefined);
    await db?.$disconnect();
  });

  it("hands the app times, not the rule the seed stored", async () => {
    const times = await get(`/mosques/${ID}/iqama`);
    assert.equal(times.length, 5);
    for (const row of times) assert.match(row.iqamaTime, CLOCK, `${row.prayer}: ${row.iqamaTime}`);
    assert.equal(times.find((row: any) => row.prayer === "FAJR").iqamaTime, "05:45");
    // the same from the older route, and from the mosque itself
    assert.deepEqual((await get(`/iqama/mosque/${ID}`)).map((row: any) => row.iqamaTime), times.map((row: any) => row.iqamaTime));
    const mosque = await get(`/mosques/${ID}`);
    for (const row of mosque.iqamaSchedules) assert.match(row.iqamaTime, CLOCK);
    // and the rule is still what is stored
    assert.equal((await open()).find((row) => row.prayer === "MAGHRIB")!.iqamaTime, "sunset+5");
  });

  it("has no times for a mosque that is not there", async () => {
    assert.deepEqual(await get("/mosques/does-not-exist/iqama"), []);
  });

  it("finds mosques within the radius the app sends, and not beyond it", async () => {
    const here = await get("/mosques/nearby?lat=43.4643&lon=-80.5204&radiusKm=1");
    assert.ok(here.mosques.some((m: any) => m.id === ID));
    const elsewhere = await get("/mosques/nearby?lat=45.5&lon=-75.5&radiusKm=1");
    assert.ok(!elsewhere.mosques.some((m: any) => m.id === ID));
    const old = await get("/mosques/nearby?lat=43.4643&lon=-80.5204&radius=1");
    assert.ok(old.mosques.some((m: any) => m.id === ID));
  });

  it("reads the mosque into rows, closing only the times that changed", async () => {
    pages = { [HOME]: page(["6:15", "1:45", "5:45", "7:28", "9:00"]) };
    const got = await enrichMosque(ID, true, { fetchText, now: NOW });
    assert.equal(got.source, "website");
    assert.deepEqual(got.changed, ["fajr", "maghrib"]);

    const now = await open();
    assert.deepEqual(now.map((row) => [row.prayer, row.iqamaTime]).sort(), [["ASR", "17:45"], ["DHUHR", "13:45"], ["FAJR", "06:15"], ["ISHA", "21:00"], ["MAGHRIB", "19:28"]]);
    // what was there is kept, closed as of the mosque's today
    const closed = (await rows()).filter((row) => row.effectiveTo !== null);
    assert.deepEqual(closed.map((row) => [row.prayer, row.iqamaTime]).sort(), [["FAJR", "05:45"], ["MAGHRIB", "sunset+5"]]);
    assert.equal(closed[0].effectiveTo!.toISOString(), "2026-09-20T00:00:00.000Z");

    const mosque = await db.mosque.findUnique({ where: { id: ID } });
    assert.equal(mosque!.iqamaSource, "website");
    assert.equal(mosque!.iqamaLastFetched!.toISOString(), NOW.toISOString());
  });

  it("adds no rows when it reads the same times again", async () => {
    const before = (await rows()).length;
    const got = await enrichMosque(ID, true, { fetchText, now: new Date(NOW.getTime() + 7 * 86_400_000) });
    assert.deepEqual(got.changed, []);
    assert.equal((await rows()).length, before);
  });

  it("serves the new times", async () => {
    const times = await get(`/mosques/${ID}/iqama`);
    assert.deepEqual(times.map((row: any) => [row.prayer, row.iqamaTime]).sort(), [["ASR", "17:45"], ["DHUHR", "13:45"], ["FAJR", "06:15"], ["ISHA", "21:00"], ["MAGHRIB", "19:28"]]);
  });

  it("leaves the times alone, and notes it looked, when the page cannot be read", async () => {
    const before = (await rows()).length;
    pages = { [HOME]: "<html><body><p>Welcome</p></body></html>" };
    const later = new Date(NOW.getTime() + 14 * 86_400_000);
    const got = await enrichMosque(ID, true, { fetchText, now: later });
    assert.equal(got.prayersFound.length, 0);
    assert.equal((await rows()).length, before);
    assert.equal((await db.mosque.findUnique({ where: { id: ID } }))!.iqamaLastFetched!.toISOString(), later.toISOString());
  });
});
