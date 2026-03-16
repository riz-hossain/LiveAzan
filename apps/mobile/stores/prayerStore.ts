import { create } from "zustand";
import type { PrayerTimes, NextPrayer, Prayer } from "@live-azan/shared";
import { getPrayerTimes, getNextPrayer } from "../services/prayerTimes";

interface PrayerState {
  prayerTimes: PrayerTimes | null;
  nextPrayer: NextPrayer | null;
  isLoading: boolean;
  fetchPrayerTimes: (lat: number, lon: number) => Promise<void>;
  updateNextPrayer: () => void;
}

export const usePrayerStore = create<PrayerState>((set, get) => ({
  prayerTimes: null,
  nextPrayer: null,
  isLoading: false,

  fetchPrayerTimes: async (lat: number, lon: number) => {
    set({ isLoading: true });
    try {
      const times = await getPrayerTimes(lat, lon);
      set({ prayerTimes: times, isLoading: false });
      get().updateNextPrayer();
    } catch {
      set({ isLoading: false });
    }
  },

  updateNextPrayer: () => {
    const { prayerTimes } = get();
    if (!prayerTimes) return;

    const next = getNextPrayer(prayerTimes);
    set({ nextPrayer: next });
  },
}));
