import { PlaceType, type IqamaSchedule, type Mosque } from "@live-azan/shared";

// --- a made-up network ---------------------------------------------------------------------------------

export type Reply = string | { body: string; status?: number; contentType?: string };

/** Where the app looks for its own server unless told otherwise; in a test it is only there when a page says so. */
const SERVER = "http://localhost:3001";

export interface FakeNetwork {
  /** Every address asked for, in order. */
  asked: string[];
  /** The headers sent with the last request for an address. */
  headersFor(url: string): Record<string, string> | undefined;
  /** Holds the answer to an address back until the returned function is called. */
  hold(url: string): () => void;
  restore(): void;
}

/**
 * Replaces the global fetch with a network of made-up pages: an address in `pages` answers, anything else is a 404,
 * and the app's own server is not there unless it has pages too.
 */
export function fakeNetwork(pages: Record<string, Reply>): FakeNetwork {
  const asked: string[] = [];
  const headers = new Map<string, Record<string, string>>();
  const gates = new Map<string, Promise<void>>();
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
    const url = String((input as { url?: string })?.url ?? input);
    asked.push(url);
    headers.set(url, { ...(init?.headers ?? {}) });
    const gate = gates.get(url);
    if (gate) await gate;
    const reply = pages[url];
    if (reply === undefined) {
      if (url.startsWith(SERVER)) throw new TypeError("fetch failed");
      return new Response("", { status: 404, headers: { "content-type": "text/html" } });
    }
    const r = typeof reply === "string" ? { body: reply } : reply;
    return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": r.contentType ?? "text/html" } });
  }) as typeof fetch;

  return {
    asked,
    headersFor: (url: string) => headers.get(url),
    hold(url: string) {
      let release!: () => void;
      gates.set(url, new Promise<void>((resolve) => (release = resolve)));
      return release;
    },
    restore() {
      globalThis.fetch = original;
    },
  };
}

// --- waiting ------------------------------------------------------------------------------------------------

/** Real time, in small steps: the clock the app sees is pinned, so nothing here may read it. */
export async function waitFor(check: () => boolean, what: string, ms = 4000): Promise<void> {
  for (let waited = 0; waited <= ms; waited += 5) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`gave up waiting for ${what}`);
}

/** Waits for a read to give something, and gives it. */
export async function eventually<T>(read: () => Promise<T | null | undefined>, what: string, ms = 4000): Promise<T> {
  for (let waited = 0; waited <= ms; waited += 5) {
    const got = await read();
    if (got) return got;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`gave up waiting for ${what}`);
}

/** Long enough for anything already under way to have finished what it does without a network. */
export const settle = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// --- pages and mosques ------------------------------------------------------------------------------------

export const page = (body: string): string => `<html><head><title>A Masjid</title></head><body>${body}</body></html>`;

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

/** A board that says which times are the iqama: right for Waterloo on the pinned day in September. */
export const board = (values = ["6:15", "1:45", "5:45", "7:28", "9:00"]): string =>
  PRAYERS.map((name, i) => `<p>${name} Iqama ${values[i]}</p>`).join("");

export const SEPTEMBER = { fajr: "06:15", dhuhr: "13:45", asr: "17:45", maghrib: "19:28", isha: "21:00" };

export const WATERLOO = { latitude: 43.4643, longitude: -80.5204 };

export function mosque(over: Record<string, unknown> = {}): Mosque {
  return {
    id: "local_ontario_waterloo_0",
    name: "Waterloo Masjid",
    type: PlaceType.MOSQUE,
    address: "1 Main St, Waterloo",
    city: "Waterloo",
    province: "Ontario",
    country: "Canada",
    ...WATERLOO,
    hasLiveStream: false,
    verified: true,
    website: "https://masjid.example/",
    ...over,
  } as Mosque;
}

/** A mosque as the bundled research has it: times written down in March, Maghrib as "sunset+5". */
export function savedMosque(over: Record<string, unknown> = {}): Mosque {
  return mosque({
    iqamaSource: "manual",
    iqamaLastFetched: "2026-03-15",
    maghribRule: "sunset+5",
    discoveredIqama: { fajr: "05:30", dhuhr: "13:30", asr: "17:30", isha: "20:30", jummah: "13:30" },
    ...over,
  });
}

/** The times on screen, by prayer, from the rows the store keeps. */
export function timesOf(schedule: IqamaSchedule[]): Record<string, string> {
  return Object.fromEntries(schedule.map((row) => [String(row.prayer).toLowerCase(), row.iqamaTime]));
}

/** A MAWAQIT search result: today's five adhans and iqamas, as clock times. */
export function listing(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    uuid: "u-1",
    slug: "some-masjid",
    name: "Some Masjid",
    ...WATERLOO,
    times: ["05:49", "07:06", "13:16", "17:34", "19:24", "20:43"],
    iqama: ["06:15", "13:45", "17:45", "19:28", "21:00"],
    iqamaEnabled: true,
    jumua: "13:30",
    ...over,
  };
}

/** MAWAQIT's search address for a place, as the app asks for it. */
export const searchUrl = (lat: number, lon: number, km: number): string =>
  `https://mawaqit.net/api/2.0/mosque/search?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&radius=${km}`;
