import { create } from "zustand";
import type { Mosque, IqamaSchedule } from "@live-azan/shared";
import { isCurrent, timesFromListing, type IqamaMeta } from "@live-azan/shared";
import {
  fetchMosquesNearby,
  fetchMosqueById,
  fetchIqama,
  followMosque as followMosqueApi,
  requestCoverage as requestCoverageApi,
} from "../services/api";
import {
  discoverNearbyIqama,
  refreshSingleMosqueIqama,
  borrowNearbyIqama,
  mosqueDay,
  schedulesFor,
  type DiscoveredMosque,
} from "../services/iqamaDiscovery";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getCached,
  setCached,
  clearCached,
  getCachedTimestamp,
  nearbyMosquesKey,
  iqamaKey,
  iqamaAttemptKey,
  mosqueDetailKey,
  NEARBY_MOSQUE_TTL,
  IQAMA_TTL,
  IQAMA_RETRY_AFTER,
  MOSQUE_DETAIL_TTL,
  PRIMARY_MOSQUE_KEY,
} from "../services/cache";
import { searchLocalMosques } from "../services/localMosqueSearch";

interface CachedIqama {
  schedules: IqamaSchedule[];
  source?: Mosque["iqamaSource"];
  lastFetched?: string;
  /** Where these came from, how sure, and what to double-check. Absent in older caches. */
  meta?: IqamaMeta;
}

interface MosqueState {
  nearbyMosques: Mosque[];
  primaryMosque: Mosque | null;
  activeMosque: Mosque | null;
  /** The mosque whose iqama is on screen: what a slow read checks before it draws. */
  iqamaFor: string | null;
  iqamaSchedule: IqamaSchedule[];
  iqamaSource: Mosque["iqamaSource"] | null;
  iqamaLastFetched: string | null;
  /** Where the times on screen came from, how far to trust them, and what to double-check. */
  iqamaMeta: IqamaMeta | null;
  /** Why the last look for this mosque's times found none, in words for a person. */
  iqamaProblems: string[];
  /** Looking at the mosque's own timetable, page and listing right now. */
  isReading: boolean;
  /** Looking for a neighbouring mosque's times right now. */
  isBorrowing: boolean;
  uncoveredArea: boolean;
  isLoading: boolean;
  isDiscovering: boolean;

  fetchNearbyMosques: (lat: number, lon: number) => Promise<void>;
  discoverIqamaNearby: (lat: number, lon: number) => Promise<DiscoveredMosque[]>;
  refreshIqama: (mosque: Mosque) => Promise<void>;
  /** The nearest mosque's times, for a mosque that has none of its own. False if none was found. */
  borrowIqama: (mosque: Mosque) => Promise<boolean>;
  loadPrimaryMosque: () => Promise<void>;
  setPrimaryMosque: (mosqueId: string) => Promise<void>;
  fetchIqamaSchedule: (mosqueId: string) => Promise<void>;
  requestCoverage: (lat: number, lon: number) => Promise<void>;
}

// ─── Reading a mosque's times ────────────────────────────────────────────────

/** Reads under way, by mosque, so that two screens asking at once cause one read. */
const reading = new Map<string, Promise<void>>();

/** The source a store consumer sees: saved research is "manual", as it always was. */
function sourceOf(meta: IqamaMeta): Mosque["iqamaSource"] {
  return meta.source === "saved" ? "manual" : meta.source;
}

/** What the server says about a mosque's times, as a meta. */
function metaFromServer(mosque: Mosque): IqamaMeta | null {
  if (!mosque.iqamaSource) return null;
  return {
    source: mosque.iqamaSource === "manual" ? "saved" : mosque.iqamaSource,
    asOf: (mosque.iqamaLastFetched ?? "").slice(0, 10),
    warnings: [],
  };
}

/**
 * Look at the mosque itself again when what is on screen is not its own reading of
 * today: saved research, a neighbour's, or yesterday's. Not more than once in a while
 * for a mosque that gave nothing, and never for a mosque that is no longer on screen.
 */
async function lookAgainIfStale(mosque: Mosque): Promise<void> {
  const state = useMosqueStore.getState();
  if (state.iqamaFor !== mosque.id) return;
  if (isCurrent(state.iqamaMeta, mosqueDay(mosque).today)) return;
  const last = await getCachedTimestamp(iqamaAttemptKey(mosque.id));
  if (last !== null && Date.now() - last < IQAMA_RETRY_AFTER) return;
  await useMosqueStore.getState().refreshIqama(mosque);
}

export const useMosqueStore = create<MosqueState>((set, get) => ({
  nearbyMosques: [],
  primaryMosque: null,
  activeMosque: null,
  iqamaFor: null,
  iqamaSchedule: [],
  iqamaSource: null,
  iqamaLastFetched: null,
  iqamaMeta: null,
  iqamaProblems: [],
  isReading: false,
  isBorrowing: false,
  uncoveredArea: false,
  isLoading: false,
  isDiscovering: false,

  // ─── Fetch nearby mosques (cache-first) ──────────────────────────────────

  fetchNearbyMosques: async (lat: number, lon: number) => {
    const key = nearbyMosquesKey(lat, lon);

    // Show local bundle immediately for instant render (no network needed)
    if (get().nearbyMosques.length === 0) {
      const local = searchLocalMosques(lat, lon, 25);
      if (local.length > 0) {
        set({ nearbyMosques: local });
      }
    }

    // Serve cache immediately for instant render
    const cached = await getCached<Mosque[]>(key, NEARBY_MOSQUE_TTL);
    if (cached) {
      set({ nearbyMosques: cached });
    }

    set({ isLoading: true });
    try {
      const response = await fetchMosquesNearby(lat, lon);
      console.log(`[MosqueStore] fetchNearbyMosques: backend returned ${response.mosques.length} mosques`);
      await setCached(key, response.mosques);
      set({
        nearbyMosques: response.mosques,
        uncoveredArea: response.uncoveredArea,
        isLoading: false,
      });
    } catch (err) {
      console.warn("[MosqueStore] fetchNearbyMosques: backend unavailable:", err);
      // Fall back to bundled local data if nothing is loaded yet
      if (get().nearbyMosques.length === 0) {
        const local = searchLocalMosques(lat, lon, 25);
        console.log(`[MosqueStore] fetchNearbyMosques: local bundle returned ${local.length} mosques`);
        if (local.length > 0) {
          await setCached(key, local);
          set({ nearbyMosques: local });
        }
      }
      set({ isLoading: false });
    }
  },

  // ─── Discover iqama times near user (MAWAQIT + website scraping) ─────────

  discoverIqamaNearby: async (lat: number, lon: number) => {
    console.log(`[MosqueStore] discoverIqamaNearby starting at (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
    set({ isDiscovering: true });

    // Show cached discovery results immediately
    const key = nearbyMosquesKey(lat, lon);
    const cached = await getCached<DiscoveredMosque[]>(key, NEARBY_MOSQUE_TTL);
    if (cached) {
      console.log(`[MosqueStore] discoverIqamaNearby: showing ${cached.length} cached mosques`);
      set({ nearbyMosques: cached });
    }

    try {
      const discovered = await discoverNearbyIqama(lat, lon);
      console.log(`[MosqueStore] discoverIqamaNearby complete: ${discovered.length} mosques`);
      set({ nearbyMosques: discovered, isDiscovering: false });
      return discovered;
    } catch (err) {
      console.warn("[MosqueStore] discoverIqamaNearby failed:", err);
      set({ isDiscovering: false });
      return [];
    }
  },

  // ─── Read one mosque's iqama times ───────────────────────────────────────

  refreshIqama: async (mosque: Mosque) => {
    const already = reading.get(mosque.id);
    if (already) return already;

    const run = (async () => {
      if (get().iqamaFor === mosque.id) set({ isReading: true });
      try {
        const result = await refreshSingleMosqueIqama(mosque);
        await setCached(iqamaAttemptKey(mosque.id), true);

        if (result.meta && Object.keys(result.times).length > 0) {
          const schedules = schedulesFor(mosque.id, result.times, result.jumuah, "live");
          const lastFetched = new Date().toISOString();
          await setCached<CachedIqama>(iqamaKey(mosque.id), {
            schedules,
            source: sourceOf(result.meta),
            lastFetched,
            meta: result.meta,
          });
          if (get().iqamaFor === mosque.id) {
            set({
              iqamaSchedule: schedules,
              iqamaSource: sourceOf(result.meta),
              iqamaLastFetched: lastFetched,
              iqamaMeta: result.meta,
              iqamaProblems: [],
            });
          }
        } else if (get().iqamaFor === mosque.id) {
          // Whatever is on screen (saved times, a neighbour's) stays; the reasons are for the person.
          set({ iqamaProblems: result.problems });
        }

        // Merge any scraped metadata (services, hours) into activeMosque
        const current = get().activeMosque;
        if (result.scrapedMeta && current && current.id === mosque.id) {
          set({
            activeMosque: {
              ...current,
              services: result.scrapedMeta.services ?? current.services,
              hours: result.scrapedMeta.hours ?? current.hours,
            },
          });
        }
      } catch (err) {
        console.warn("[MosqueStore] refreshIqama failed:", err);
      } finally {
        reading.delete(mosque.id);
        if (get().iqamaFor === mosque.id) set({ isReading: false });
      }
    })();
    reading.set(mosque.id, run);
    return run;
  },

  // ─── Borrow the nearest mosque's times ───────────────────────────────────

  borrowIqama: async (mosque: Mosque) => {
    set({ isBorrowing: true });
    try {
      const nearby = get().nearbyMosques;
      const pool = nearby.length > 1 ? nearby : searchLocalMosques(mosque.latitude, mosque.longitude, 25);
      const got = await borrowNearbyIqama(mosque, pool);
      if (!got) return false;

      const schedules = schedulesFor(mosque.id, got.times, got.jumuah, "nearby");
      const lastFetched = new Date().toISOString();
      await setCached<CachedIqama>(iqamaKey(mosque.id), {
        schedules,
        source: "nearby",
        lastFetched,
        meta: got.meta,
      });
      if (get().iqamaFor === mosque.id) {
        set({
          iqamaSchedule: schedules,
          iqamaSource: "nearby",
          iqamaLastFetched: lastFetched,
          iqamaMeta: got.meta,
          iqamaProblems: [],
        });
      }
      return true;
    } catch (err) {
      console.warn("[MosqueStore] borrowIqama failed:", err);
      return false;
    } finally {
      set({ isBorrowing: false });
    }
  },

  // ─── Load persisted primary mosque on startup ────────────────────────────

  loadPrimaryMosque: async () => {
    try {
      const raw = await AsyncStorage.getItem(PRIMARY_MOSQUE_KEY);
      if (!raw) return;
      const mosque: Mosque = JSON.parse(raw);
      set({ primaryMosque: mosque });
      // Refresh iqama schedule silently in the background
      get().fetchIqamaSchedule(mosque.id).catch(() => {});
    } catch {
      // Ignore — app works without a primary mosque
    }
  },

  // ─── Set primary mosque ──────────────────────────────────────────────────

  setPrimaryMosque: async (mosqueId: string) => {
    try {
      // Resolve mosque object — prefer in-memory list to avoid a network round-trip
      let mosque: Mosque | null =
        get().nearbyMosques.find((m) => m.id === mosqueId) ?? null;
      if (!mosque) {
        mosque = await fetchMosqueById(mosqueId);
      }

      // Persist locally so it survives restarts for guests and logged-in users
      await AsyncStorage.setItem(PRIMARY_MOSQUE_KEY, JSON.stringify(mosque));
      await setCached(mosqueDetailKey(mosqueId), mosque);
      set({ primaryMosque: mosque });

      // Sync with server when the user is authenticated; silently ignore for guests
      followMosqueApi(mosqueId, true).catch(() => {});
    } catch (error) {
      throw error;
    }
  },

  // ─── Fetch iqama schedule (cache-first) ──────────────────────────────────

  fetchIqamaSchedule: async (mosqueId: string) => {
    const cacheK = iqamaKey(mosqueId);
    const detailK = mosqueDetailKey(mosqueId);

    // Always reset to the newly selected mosque immediately so navigating
    // between mosques never shows stale data from a previously visited mosque.
    // The primary mosque is known from the start, before any list has loaded.
    const fromList =
      get().nearbyMosques.find((m) => m.id === mosqueId) ??
      (get().primaryMosque?.id === mosqueId ? get().primaryMosque ?? undefined : undefined);
    set({
      iqamaFor: mosqueId,
      activeMosque: fromList ?? null,
      iqamaSchedule: [],
      iqamaSource: null,
      iqamaLastFetched: null,
      iqamaMeta: null,
      iqamaProblems: [],
      isReading: reading.has(mosqueId),
    });

    // Serve from cache immediately
    const [cachedIqama, cachedMosque] = await Promise.all([
      getCached<CachedIqama>(cacheK, IQAMA_TTL),
      getCached<Mosque>(detailK, MOSQUE_DETAIL_TTL),
    ]);
    if (get().iqamaFor !== mosqueId) return; // the person has moved on

    if (cachedIqama || cachedMosque) {
      set({
        iqamaSchedule: cachedIqama?.schedules ?? [],
        iqamaSource: cachedIqama?.source ?? null,
        iqamaLastFetched: cachedIqama?.lastFetched ?? null,
        iqamaMeta: cachedIqama?.meta ?? null,
        activeMosque: cachedMosque ?? get().activeMosque,
      });
    }

    // Look at the mosque itself for today's times, at the same time as the server is
    // asked: the server is optional and may take its whole timeout to say it is not there.
    let looked = false;
    const lookAt = (m: Mosque | null | undefined) => {
      if (!m || looked) return;
      looked = true;
      void lookAgainIfStale(m);
    };
    lookAt(get().activeMosque);

    set({ isLoading: true });
    let fetched: Mosque | null = null;
    try {
      const [schedule, mosque] = await Promise.all([
        fetchIqama(mosqueId),
        fetchMosqueById(mosqueId),
      ]);
      fetched = mosque;
      await setCached(detailK, mosque);

      // The server's times do not replace a reading of today that has come in meanwhile.
      const superseded = isCurrent(get().iqamaMeta, mosqueDay(mosque).today);
      if (get().iqamaFor === mosqueId && schedule.length > 0 && !superseded) {
        const meta = metaFromServer(mosque);
        await setCached<CachedIqama>(cacheK, {
          schedules: schedule,
          source: mosque.iqamaSource ?? undefined,
          lastFetched: mosque.iqamaLastFetched ?? undefined,
          meta: meta ?? undefined,
        });
        set({
          iqamaSchedule: schedule,
          iqamaSource: mosque.iqamaSource ?? null,
          iqamaLastFetched: mosque.iqamaLastFetched ?? null,
          iqamaMeta: meta,
        });
      }
      if (get().iqamaFor === mosqueId) set({ activeMosque: mosque });
    } catch {
      // No server (it is optional), or it failed: what is on screen stays.
    }
    if (get().iqamaFor !== mosqueId) return;

    // Nothing from the cache or the server: what the mosque's listing came with, as what it is.
    const shown = get().activeMosque ?? fromList ?? fetched;
    if (get().iqamaSchedule.length === 0 && shown) {
      const { today, where } = mosqueDay(shown);
      const listed = timesFromListing(shown as DiscoveredMosque, { today, where });
      if (listed) {
        set({
          iqamaSchedule: schedulesFor(shown.id, listed.times, listed.jumuah, "listed"),
          iqamaSource: sourceOf(listed.meta),
          iqamaLastFetched: listed.meta.asOf || null,
          iqamaMeta: listed.meta,
        });
      }
    }
    if (shown && !get().activeMosque) set({ activeMosque: shown });
    set({ isLoading: false });
    lookAt(shown);
  },

  // ─── Coverage request ────────────────────────────────────────────────────

  requestCoverage: async (lat: number, lon: number) => {
    try {
      await requestCoverageApi(lat, lon);
      set({ uncoveredArea: false });
    } catch (error) {
      throw error;
    }
  },
}));
