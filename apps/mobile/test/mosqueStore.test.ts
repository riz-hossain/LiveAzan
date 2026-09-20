import assert from "node:assert/strict";
import { afterEach, before, after, beforeEach, describe, it, mock } from "node:test";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMosqueStore } from "../stores/mosqueStore";
import { eventually, fakeNetwork, board, mosque, page, savedMosque, settle, timesOf, waitFor, SEPTEMBER, type FakeNetwork } from "./helpers";

const HOME = "https://masjid.example/";
const NOON_SEPTEMBER_20 = Date.UTC(2026, 8, 20, 15, 0, 0); // 11:00 in Toronto
const HOUR = 3_600_000;

const initial = useMosqueStore.getState();
const state = () => useMosqueStore.getState();
const cached = async (key: string): Promise<any> => JSON.parse((await AsyncStorage.getItem(key)) ?? "null");

let net: FakeNetwork;

before(() => mock.timers.enable({ apis: ["Date"], now: NOON_SEPTEMBER_20 }));
after(() => mock.timers.reset());
beforeEach(async () => {
  mock.timers.setTime(NOON_SEPTEMBER_20);
  await AsyncStorage.clear();
  useMosqueStore.setState(initial, true);
});
afterEach(async () => {
  await settle();
  net?.restore();
});

describe("a mosque that publishes its times", () => {
  it("shows the saved times at once, then the mosque's own reading of today in their place", async () => {
    net = fakeNetwork({ [HOME]: page(board()) });
    const release = net.hold(HOME);
    const saved = savedMosque();
    useMosqueStore.setState({ nearbyMosques: [saved] });

    await state().fetchIqamaSchedule(saved.id);
    assert.equal(state().iqamaMeta?.source, "saved");
    assert.equal(state().iqamaMeta?.asOf, "2026-03-15");
    assert.equal(timesOf(state().iqamaSchedule).fajr, "05:30");
    assert.ok(timesOf(state().iqamaSchedule).maghrib, "Maghrib is worked out from sunset+5 for today");
    assert.equal(timesOf(state().iqamaSchedule).jummah, "13:30");
    await waitFor(() => state().isReading, "the read to start");

    release();
    await waitFor(() => state().iqamaMeta?.source === "website", "the reading");
    assert.deepEqual({ ...timesOf(state().iqamaSchedule) }, SEPTEMBER);
    assert.equal(state().iqamaMeta?.how, "labelled");
    assert.equal(state().iqamaMeta?.asOf, "2026-09-20");
    assert.deepEqual(state().iqamaProblems, []);
    assert.equal(state().isReading, false);
  });

  it("keeps what it read for next time, and does not read again while it is today's", async () => {
    net = fakeNetwork({ [HOME]: page(board()) });
    const m = mosque();
    useMosqueStore.setState({ nearbyMosques: [m] });
    await state().fetchIqamaSchedule(m.id);
    await waitFor(() => state().iqamaMeta?.source === "website", "the reading");
    const stored = await cached(`iqama_${m.id}`);
    assert.equal(stored.data.meta.source, "website");
    assert.equal(stored.data.schedules.length, 5);

    // a fresh start of the app: the state is gone, the storage is not, and the primary mosque is loaded from it
    useMosqueStore.setState({ ...initial, primaryMosque: m }, true);
    net.asked.length = 0;
    await state().fetchIqamaSchedule(m.id);
    assert.equal(state().iqamaMeta?.source, "website");
    assert.deepEqual(timesOf(state().iqamaSchedule), SEPTEMBER);
    await settle();
    assert.deepEqual(net.asked.filter((url) => url.startsWith("https://masjid.example")), []);
  });

  it("looks again the next day, showing yesterday's with its date until then", async () => {
    net = fakeNetwork({ [HOME]: page(board()) });
    const m = mosque();
    useMosqueStore.setState({ nearbyMosques: [m] });
    await state().fetchIqamaSchedule(m.id);
    await waitFor(() => state().iqamaMeta?.source === "website", "the reading");

    mock.timers.setTime(NOON_SEPTEMBER_20 + 24 * HOUR);
    useMosqueStore.setState({ ...initial, primaryMosque: m }, true);
    net.asked.length = 0;
    const release = net.hold(HOME);
    await state().fetchIqamaSchedule(m.id);
    assert.equal(state().iqamaMeta?.asOf, "2026-09-20"); // yesterday's, labelled as such
    await waitFor(() => net.asked.includes(HOME), "another look at the page");
    release();
    await waitFor(() => state().iqamaMeta?.asOf === "2026-09-21", "today's reading");
  });

  it("does not read again when the cache already holds today's reading", async () => {
    net = fakeNetwork({ [HOME]: page(board()) });
    const m = mosque();
    const meta = { source: "website", how: "labelled", asOf: "2026-09-20", warnings: [] };
    const schedules = [{ id: "c1", mosqueId: m.id, prayer: "FAJR", iqamaTime: "06:15", effectiveFrom: "2026-09-20T12:00:00.000Z" }];
    await AsyncStorage.setItem(`iqama_${m.id}`, JSON.stringify({ data: { schedules, source: "website", meta }, cachedAt: Date.now() }));
    useMosqueStore.setState({ nearbyMosques: [m] });

    await state().fetchIqamaSchedule(m.id);
    await settle();
    assert.equal(state().iqamaMeta?.source, "website");
    assert.deepEqual(net.asked.filter((url) => url.startsWith("https://masjid.example")), []);
  });

  it("asks once when two screens ask at the same time", async () => {
    net = fakeNetwork({ [HOME]: page(board()) });
    const m = mosque();
    useMosqueStore.setState({ nearbyMosques: [m] });
    await Promise.all([state().fetchIqamaSchedule(m.id), state().fetchIqamaSchedule(m.id), state().refreshIqama(m)]);
    await waitFor(() => state().iqamaMeta?.source === "website", "the reading");
    await settle();
    assert.equal(net.asked.filter((url) => url === HOME).length, 1);
  });
});

describe("a mosque with nothing that can be read", () => {
  it("keeps its saved times, says why nothing better was found, and does not try again for hours", async () => {
    net = fakeNetwork({ [HOME]: page("<p>Welcome to our masjid</p>") });
    const saved = savedMosque();
    useMosqueStore.setState({ nearbyMosques: [saved] });

    await state().fetchIqamaSchedule(saved.id);
    await waitFor(() => state().iqamaProblems.length > 0 && !state().isReading, "the read to fail");
    assert.equal(state().iqamaMeta?.source, "saved");
    assert.equal(timesOf(state().iqamaSchedule).fajr, "05:30");

    const looks = () => net.asked.filter((url) => url === HOME).length;
    const first = looks();
    assert.ok(first >= 1);

    // opening it again soon is not another read...
    await state().fetchIqamaSchedule(saved.id);
    await settle();
    assert.equal(looks(), first);

    // ...the refresh button is...
    await state().refreshIqama(saved);
    assert.ok(looks() > first);

    // ...and neither is the passing of the afternoon
    const second = looks();
    mock.timers.setTime(NOON_SEPTEMBER_20 + 7 * HOUR);
    await state().fetchIqamaSchedule(saved.id);
    await waitFor(() => looks() > second, "another look, hours later");
  });

  it("does not show a mosque's times that a second look proved wrong", async () => {
    // the page says Fajr 6:15 for today; the mosque's saved times said 05:30 in March. The page wins, in full.
    net = fakeNetwork({ [HOME]: page(board()) });
    const saved = savedMosque();
    useMosqueStore.setState({ nearbyMosques: [saved] });
    await state().fetchIqamaSchedule(saved.id);
    await waitFor(() => state().iqamaMeta?.source === "website", "the reading");
    assert.notEqual(timesOf(state().iqamaSchedule).fajr, "05:30");
    assert.equal(timesOf(state().iqamaSchedule).dhuhr, "13:45");
  });

  it("offers a neighbour's times, labelled as the neighbour's and approximate, and keeps them", async () => {
    const neighbour = mosque({ id: "n1", name: "Masjid Bilal", latitude: 43.4743, longitude: -80.5304, website: "https://bilal.example/" });
    net = fakeNetwork({
      [HOME]: page("<p>Welcome</p>"),
      "https://bilal.example/": page(board(["6:20", "1:45", "5:45", "7:30", "9:05"])),
    });
    const lonely = mosque({ discoveredIqama: undefined });
    // a nearer mosque with no website and no MAWAQIT listing to read is not worth asking about
    const bare = mosque({ id: "n0", name: "Musalla Hall", latitude: 43.465, longitude: -80.521, website: undefined });
    useMosqueStore.setState({ nearbyMosques: [lonely, bare, neighbour] });

    await state().fetchIqamaSchedule(lonely.id);
    await waitFor(() => state().iqamaProblems.length > 0 && !state().isReading, "the read to fail");
    assert.equal(state().iqamaSchedule.length, 0);

    assert.equal(await state().borrowIqama(lonely), true);
    const meta = state().iqamaMeta!;
    assert.equal(meta.source, "nearby");
    assert.equal(meta.from?.name, "Masjid Bilal");
    assert.ok(meta.from!.km > 1 && meta.from!.km < 3, String(meta.from?.km));
    assert.equal(timesOf(state().iqamaSchedule).fajr, "06:20");
    assert.equal((await cached(`iqama_${lonely.id}`)).data.meta.source, "nearby");
    assert.equal(state().isBorrowing, false);
    assert.ok(!net.asked.some((url) => url.includes("lat=43.465000")), "the mosque with nothing to read was looked up");
  });

  it("says so when no neighbour has anything either", async () => {
    net = fakeNetwork({ [HOME]: page("<p>Welcome</p>"), "https://bilal.example/": page("<p>Welcome</p>") });
    const lonely = mosque();
    const neighbour = mosque({ id: "n1", name: "Masjid Bilal", latitude: 43.4743, longitude: -80.5304, website: "https://bilal.example/" });
    useMosqueStore.setState({ nearbyMosques: [lonely, neighbour] });
    assert.equal(await state().borrowIqama(lonely), false);
    assert.equal(state().isBorrowing, false);
  });
});

describe("moving between mosques", () => {
  it("does not draw one mosque's slow reading over the mosque on screen now", async () => {
    const other = mosque({ id: "other", name: "Another Masjid", website: "https://other.example/", latitude: 43.5, longitude: -80.5 });
    net = fakeNetwork({ [HOME]: page(board()), "https://other.example/": page("<p>Welcome</p>") });
    const release = net.hold(HOME);
    const first = mosque();
    useMosqueStore.setState({ nearbyMosques: [first, other] });

    await state().fetchIqamaSchedule(first.id);
    await waitFor(() => state().isReading, "the first read to start");
    await state().fetchIqamaSchedule(other.id);
    assert.equal(state().iqamaFor, other.id);

    release();
    // the first mosque's reading is kept for when it is opened again...
    const stored = await eventually(() => cached(`iqama_${first.id}`), "the first mosque's reading to be kept");
    assert.equal(stored.data.meta.source, "website");
    // ...but is not what is on screen
    assert.equal(state().iqamaFor, other.id);
    assert.deepEqual(state().iqamaSchedule, []);
    assert.equal(state().iqamaMeta, null);
  });
});

describe("moving on before the cache has answered", () => {
  it("does not draw the first mosque's cached times over the second", async () => {
    net = fakeNetwork({});
    const first = mosque();
    const second = mosque({ id: "second", name: "Another Masjid", website: undefined, discoveredIqama: undefined, latitude: 43.5, longitude: -80.5 });
    const meta = { source: "website", how: "labelled", asOf: "2026-09-20", warnings: [] };
    const schedules = [{ id: "c1", mosqueId: first.id, prayer: "FAJR", iqamaTime: "06:15", effectiveFrom: "2026-09-20T12:00:00.000Z" }];
    await AsyncStorage.setItem(`iqama_${first.id}`, JSON.stringify({ data: { schedules, source: "website", meta }, cachedAt: Date.now() }));
    useMosqueStore.setState({ nearbyMosques: [first, second] });

    await Promise.all([state().fetchIqamaSchedule(first.id), state().fetchIqamaSchedule(second.id)]);
    assert.equal(state().iqamaFor, second.id);
    assert.equal(state().iqamaMeta, null);
    assert.deepEqual(state().iqamaSchedule, []);
  });
});

describe("a server that may or may not be there", () => {
  const server = (m: ReturnType<typeof mosque>, fetchedAt: string) => ({
    [`http://localhost:3001/api/mosques/${m.id}/iqama`]: {
      body: JSON.stringify([{ id: "s1", mosqueId: m.id, prayer: "FAJR", iqamaTime: "05:45", effectiveFrom: fetchedAt }]),
      contentType: "application/json",
    },
    [`http://localhost:3001/api/mosques/${m.id}`]: {
      body: JSON.stringify({ ...m, iqamaSource: "mawaqit", iqamaLastFetched: fetchedAt }),
      contentType: "application/json",
    },
  });

  it("does not replace a reading of today with what it had from before", async () => {
    const m = mosque();
    net = fakeNetwork({ [HOME]: page(board()), ...server(m, "2026-09-10T00:00:00.000Z") });
    const releaseServer = net.hold(`http://localhost:3001/api/mosques/${m.id}/iqama`);
    useMosqueStore.setState({ nearbyMosques: [m] });

    await Promise.race([state().fetchIqamaSchedule(m.id), settle(300)]);
    await waitFor(() => state().iqamaMeta?.source === "website", "the mosque's own reading");
    releaseServer();
    await settle(100);
    assert.equal(state().iqamaMeta?.source, "website");
    assert.equal(timesOf(state().iqamaSchedule).fajr, "06:15");
  });

  it("is not believed when it sends a rule where a time belongs", async () => {
    const m = mosque({ website: undefined });
    const day = "2026-09-10T00:00:00.000Z";
    net = fakeNetwork({
      [`http://localhost:3001/api/mosques/${m.id}/iqama`]: {
        body: JSON.stringify([
          { id: "s1", mosqueId: m.id, prayer: "FAJR", iqamaTime: "05:45", effectiveFrom: day },
          { id: "s2", mosqueId: m.id, prayer: "MAGHRIB", iqamaTime: "sunset+5", effectiveFrom: day },
        ]),
        contentType: "application/json",
      },
      [`http://localhost:3001/api/mosques/${m.id}`]: { body: JSON.stringify({ ...m, iqamaSource: "manual", iqamaLastFetched: day }), contentType: "application/json" },
    });
    useMosqueStore.setState({ nearbyMosques: [m] });
    await state().fetchIqamaSchedule(m.id);
    assert.deepEqual(timesOf(state().iqamaSchedule), { fajr: "05:45" });
  });

  it("is shown while the mosque's own page is read, and replaced by it", async () => {
    const m = mosque();
    net = fakeNetwork({ [HOME]: page(board()), ...server(m, "2026-09-10T00:00:00.000Z") });
    const releasePage = net.hold(HOME);
    useMosqueStore.setState({ nearbyMosques: [m] });

    await state().fetchIqamaSchedule(m.id);
    assert.equal(state().iqamaMeta?.source, "mawaqit"); // what the server said, and when
    assert.equal(state().iqamaMeta?.asOf, "2026-09-10");
    assert.equal(timesOf(state().iqamaSchedule).fajr, "05:45");
    releasePage();
    await waitFor(() => state().iqamaMeta?.source === "website", "the mosque's own reading");
    assert.equal(timesOf(state().iqamaSchedule).fajr, "06:15");
  });
});
