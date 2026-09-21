import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { discoverNearbyIqama } from "../services/iqamaDiscovery";
import { fetchText } from "../services/http";
import { searchLocalMosques } from "../services/localMosqueSearch";
import { fakeNetwork, listing, searchUrl, settle, WATERLOO, type FakeNetwork } from "./helpers";

const { latitude: LAT, longitude: LON } = WATERLOO;

let net: FakeNetwork;
beforeEach(() => AsyncStorage.clear());
afterEach(async () => {
  await settle(10);
  net?.restore();
});

/** What the bundled research has near Waterloo: with times, and without. */
function bundled() {
  const near = searchLocalMosques(LAT, LON, 25);
  const bare = near.filter((m) => !m.discoveredIqama);
  const withTimes = near.find((m) => m.discoveredIqama && Object.keys(m.discoveredIqama).length > 0)!;
  assert.ok(bare.length >= 2 && withTimes, "the bundle has changed under this test");
  return { near, withTimes, bare };
}

describe("making the list of mosques near someone", () => {
  it("asks MAWAQIT for kilometres, not metres", async () => {
    net = fakeNetwork({ [searchUrl(LAT, LON, 15)]: "[]" });
    await discoverNearbyIqama(LAT, LON);
    assert.ok(net.asked.includes(searchUrl(LAT, LON, 15)), net.asked.join("\n"));
  });

  it("gives a bundled mosque that has no times its MAWAQIT listing's, when the listing is that mosque", async () => {
    const { bare } = bundled();
    const target = bare.find((m) => m.website && m.name.startsWith("Al-Salaam"))!;
    assert.ok(target, "the bundle no longer has Al-Salaam Islamic Centre near Waterloo");
    net = fakeNetwork({
      [searchUrl(LAT, LON, 15)]: JSON.stringify([listing({ uuid: "u-salaam", slug: "al-salaam", name: target.name, latitude: target.latitude, longitude: target.longitude })]),
    });
    const found = (await discoverNearbyIqama(LAT, LON)).find((m) => m.id === target.id)!;
    assert.equal(found.iqamaSource, "mawaqit");
    assert.equal(found.mawaqitId, "u-salaam");
    assert.deepEqual(found.discoveredIqama, { fajr: "06:15", dhuhr: "13:45", asr: "17:45", maghrib: "19:28", isha: "21:00" });
  });

  it("does not, when the listing is another mosque down the road", async () => {
    const { bare } = bundled();
    // Any mosque with a website and no times will do: which one is not the point, and choosing it by
    // name broke this test when the audit rightly took a dead website away from the one it named.
    const target = bare.find((m) => m.website && !m.name.startsWith("Al-Salaam"))!;
    assert.ok(target, "the bundle has no second mosque with a website and no times near Waterloo");
    net = fakeNetwork({
      [searchUrl(LAT, LON, 15)]: JSON.stringify([
        listing({ uuid: "u-decoy", slug: "zzz-other-centre", name: "Zzz Other Centre", latitude: target.latitude + 0.0036, longitude: target.longitude }),
      ]),
    });
    const list = await discoverNearbyIqama(LAT, LON);
    const found = list.find((m) => m.id === target.id)!;
    assert.equal(found.discoveredIqama, undefined);
    assert.notEqual(found.iqamaSource, "mawaqit");
    assert.notEqual(found.mawaqitId, "u-decoy");
    // the other mosque is still on the list, as itself, with its own times
    const decoy = list.find((m) => m.id === "u-decoy")!;
    assert.equal(decoy.iqamaSource, "mawaqit");
    assert.equal(decoy.discoveredIqama?.fajr, "06:15");
  });

  it("lists a mosque only MAWAQIT knows, with its times", async () => {
    net = fakeNetwork({ [searchUrl(LAT, LON, 15)]: JSON.stringify([listing({ uuid: "u-new", slug: "new-masjid", name: "New Masjid", latitude: 43.6, longitude: -80.55 })]) });
    const found = (await discoverNearbyIqama(LAT, LON)).find((m) => m.id === "u-new")!;
    assert.equal(found.name, "New Masjid");
    assert.equal(found.iqamaSource, "mawaqit");
    assert.equal(found.discoveredIqama?.isha, "21:00");
  });

  it("keeps the bundled research as saved times, whatever MAWAQIT says about the same mosque", async () => {
    const { withTimes } = bundled();
    net = fakeNetwork({
      [searchUrl(LAT, LON, 15)]: JSON.stringify([listing({ name: withTimes.name, latitude: withTimes.latitude, longitude: withTimes.longitude })]),
    });
    const found = (await discoverNearbyIqama(LAT, LON)).find((m) => m.id === withTimes.id)!;
    assert.equal(found.iqamaSource, "manual");
    assert.equal(found.iqamaLastFetched, "2026-03-15");
    assert.deepEqual(found.discoveredIqama, withTimes.discoveredIqama);
  });

  it("reads no mosque's website: that is for the one a person opens", async () => {
    net = fakeNetwork({ [searchUrl(LAT, LON, 15)]: "[]" });
    await discoverNearbyIqama(LAT, LON);
    const hosts = new Set(net.asked.map((url) => new URL(url).host));
    assert.deepEqual([...hosts].sort(), ["localhost:3001", "mawaqit.net", "overpass-api.de"]);
  });

  it("does not overwrite what was read for a mosque with what the list came with", async () => {
    const { withTimes } = bundled();
    const key = `iqama_${withTimes.id}`;
    await AsyncStorage.setItem(key, JSON.stringify({ data: { schedules: [], meta: { source: "website" } }, cachedAt: 1 }));
    net = fakeNetwork({ [searchUrl(LAT, LON, 15)]: "[]" });
    await discoverNearbyIqama(LAT, LON);
    assert.equal(JSON.parse((await AsyncStorage.getItem(key))!).data.meta.source, "website");
  });
});

describe("calling out to the web", () => {
  it("looks like a browser to MAWAQIT, which turns away anything else, and says who it is to everyone else", async () => {
    net = fakeNetwork({});
    await fetchText("https://mawaqit.net/en/a-masjid");
    await fetchText("https://masjid.example/");
    assert.match(net.headersFor("https://mawaqit.net/en/a-masjid")!["User-Agent"], /Mozilla/);
    assert.match(net.headersFor("https://masjid.example/")!["User-Agent"], /^LiveAzan/);
  });
});
