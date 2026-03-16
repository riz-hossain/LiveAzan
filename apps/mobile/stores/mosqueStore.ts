import { create } from "zustand";
import type { Mosque, IqamaSchedule } from "@live-azan/shared";
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
  type DiscoveredMosque,
} from "../services/iqamaDiscovery";
import {
  getCached,
  setCached,
  clearCached,
  getCachedTimestamp,
  nearbyMosquesKey,
  iqamaKey,
  mosqueDetailKey,
  NEARBY_MOSQUE_TTL,
  IQAMA_TTL,
  MOSQUE_DETAIL_TTL,
} from "../services/cache";
import { searchLocalMosques } from "../services/localMosqueSearch";

interface CachedIqama {
  schedules: IqamaSchedule[];
  source?: "mawaqit" | "website" | "manual";
  lastFetched?: string;
}

interface MosqueState {
  nearbyMosques: Mosque[];
  primaryMosque: Mosque | null;
  activeMosque: Mosque | null;
  iqamaSchedule: IqamaSchedule[];
  iqamaSource: "mawaqit" | "website" | "manual" | null;
  iqamaLastFetched: string | null;
  uncoveredArea: boolean;
  isLoading: boolean;
  isDiscovering: boolean;

  fetchNearbyMosques: (lat: number, lon: number) => Promise<void>;
  discoverIqamaNearby: (lat: number, lon: number) => Promise<DiscoveredMosque[]>;
  refreshIqama: (mosque: Mosque) => Promise<void>;
  setPrimaryMosque: (mosqueId: string) => Promise<void>;
  fetchIqamaSchedule: (mosqueId: string) => Promise<void>;
  requestCoverage: (lat: number, lon: number) => Promise<void>;
}

export const useMosqueStore = create<MosqueState>((set, get) => ({
  nearbyMosques: [],
  primaryMosque: null,
  activeMosque: null,
  iqamaSchedule: [],
  iqamaSource: null,
  iqamaLastFetched: null,
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

  // ─── Refresh iqama for a single mosque ───────────────────────────────────

  refreshIqama: async (mosque: Mosque) => {
    set({ isLoading: true });
    try {
      const result = await refreshSingleMosqueIqama(mosque);
      const { iqamaTimes, source, scrapedMeta } = result;

      if (Object.keys(iqamaTimes).length > 0) {
        // Build IqamaSchedule array from discovered times
        const now = new Date().toISOString();
        const prayerMap: Array<[string, string]> = [
          ["fajr", "FAJR"],
          ["dhuhr", "DHUHR"],
          ["asr", "ASR"],
          ["maghrib", "MAGHRIB"],
          ["isha", "ISHA"],
        ];
        const schedules: IqamaSchedule[] = prayerMap
          .filter(([k]) => (iqamaTimes as any)[k])
          .map(([k, prayer]) => ({
            id: `${mosque.id}_${prayer}_refreshed`,
            mosqueId: mosque.id,
            prayer: prayer as any,
            iqamaTime: (iqamaTimes as any)[k],
            effectiveFrom: now,
          }));

        set({
          iqamaSchedule: schedules,
          iqamaSource: source,
          iqamaLastFetched: now,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }

      // Merge any scraped metadata (services, hours) into activeMosque
      if (scrapedMeta) {
        const current = get().activeMosque;
        if (current) {
          set({
            activeMosque: {
              ...current,
              services: scrapedMeta.services ?? current.services,
              hours: scrapedMeta.hours ?? current.hours,
            },
          });
        }
      }
    } catch {
      set({ isLoading: false });
    }
  },

  // ─── Set primary mosque ──────────────────────────────────────────────────

  setPrimaryMosque: async (mosqueId: string) => {
    try {
      await followMosqueApi(mosqueId, true);
      const mosque = await fetchMosqueById(mosqueId);
      await setCached(mosqueDetailKey(mosqueId), mosque);
      set({ primaryMosque: mosque });
    } catch (error) {
      throw error;
    }
  },

  // ─── Fetch iqama schedule (cache-first) ──────────────────────────────────

  fetchIqamaSchedule: async (mosqueId: string) => {
    const cacheK = iqamaKey(mosqueId);
    const detailK = mosqueDetailKey(mosqueId);

    // Immediately populate activeMosque from already-loaded list so detail screen renders instantly
    const fromList = get().nearbyMosques.find((m) => m.id === mosqueId);
    if (fromList && !get().activeMosque) {
      set({ activeMosque: fromList });
    }

    // Serve from cache immediately
    const [cachedIqama, cachedMosque] = await Promise.all([
      getCached<CachedIqama>(cacheK, IQAMA_TTL),
      getCached<Mosque>(detailK, MOSQUE_DETAIL_TTL),
    ]);

    if (cachedIqama || cachedMosque) {
      set({
        iqamaSchedule: cachedIqama?.schedules ?? [],
        iqamaSource: cachedIqama?.source ?? null,
        iqamaLastFetched: cachedIqama?.lastFetched ?? null,
        activeMosque: cachedMosque ?? get().activeMosque,
      });
    }

    set({ isLoading: true });
    try {
      const [schedule, mosque] = await Promise.all([
        fetchIqama(mosqueId),
        fetchMosqueById(mosqueId),
      ]);

      // Determine source from mosque metadata
      const source = mosque.iqamaSource ?? null;
      const lastFetched = mosque.iqamaLastFetched ?? null;

      await Promise.all([
        setCached<CachedIqama>(cacheK, {
          schedules: schedule,
          source: source ?? undefined,
          lastFetched: lastFetched ?? undefined,
        }),
        setCached(detailK, mosque),
      ]);

      set({
        iqamaSchedule: schedule,
        activeMosque: mosque,
        iqamaSource: source,
        iqamaLastFetched: lastFetched,
        isLoading: false,
      });
    } catch {
      // Keep cached data visible if API fails; fall back to list data if no activeMosque
      const stillNoMosque = !get().activeMosque;
      if (stillNoMosque && fromList) {
        set({ activeMosque: fromList });
      }
      set({ isLoading: false });
    }
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
