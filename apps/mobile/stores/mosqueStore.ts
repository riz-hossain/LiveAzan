import { create } from "zustand";
import type { Mosque, IqamaSchedule } from "../packages/shared/src/types";
import {
  fetchMosquesNearby,
  fetchMosqueById,
  fetchIqama,
  followMosque as followMosqueApi,
  requestCoverage as requestCoverageApi,
} from "../services/api";

interface MosqueState {
  nearbyMosques: Mosque[];
  primaryMosque: Mosque | null;
  activeMosque: Mosque | null;
  iqamaSchedule: IqamaSchedule[];
  uncoveredArea: boolean;
  isLoading: boolean;
  fetchNearbyMosques: (lat: number, lon: number) => Promise<void>;
  setPrimaryMosque: (mosqueId: string) => Promise<void>;
  fetchIqamaSchedule: (mosqueId: string) => Promise<void>;
  requestCoverage: (lat: number, lon: number) => Promise<void>;
}

export const useMosqueStore = create<MosqueState>((set, get) => ({
  nearbyMosques: [],
  primaryMosque: null,
  activeMosque: null,
  iqamaSchedule: [],
  uncoveredArea: false,
  isLoading: false,

  fetchNearbyMosques: async (lat: number, lon: number) => {
    set({ isLoading: true });
    try {
      const response = await fetchMosquesNearby(lat, lon);
      set({
        nearbyMosques: response.mosques,
        uncoveredArea: response.uncoveredArea,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setPrimaryMosque: async (mosqueId: string) => {
    try {
      await followMosqueApi(mosqueId, true);
      const mosque = await fetchMosqueById(mosqueId);
      set({ primaryMosque: mosque });
    } catch (error) {
      throw error;
    }
  },

  fetchIqamaSchedule: async (mosqueId: string) => {
    set({ isLoading: true });
    try {
      const [schedule, mosque] = await Promise.all([
        fetchIqama(mosqueId),
        fetchMosqueById(mosqueId),
      ]);
      set({
        iqamaSchedule: schedule,
        activeMosque: mosque,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  requestCoverage: async (lat: number, lon: number) => {
    try {
      await requestCoverageApi(lat, lon);
      set({ uncoveredArea: false });
    } catch (error) {
      throw error;
    }
  },
}));
