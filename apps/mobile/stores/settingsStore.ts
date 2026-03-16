import { create } from "zustand";
import type { UserPrayerPreference, Prayer } from "@live-azan/shared";
import {
  fetchPrayerPrefs,
  updatePrayerPrefs,
  updateProfile,
} from "../services/api";

interface SettingsState {
  prayerPrefs: UserPrayerPreference[];
  calcMethod: number;
  azanSound: string;
  defaultLeadMinutes: number;
  fetchPreferences: () => Promise<void>;
  updateLeadTime: (prayer: Prayer, minutes: number) => Promise<void>;
  updateCalcMethod: (method: number) => Promise<void>;
  updateAzanSound: (sound: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  prayerPrefs: [],
  calcMethod: 2, // ISNA default
  azanSound: "azan-default",
  defaultLeadMinutes: 15,

  fetchPreferences: async () => {
    try {
      const prefs = await fetchPrayerPrefs();
      set({ prayerPrefs: prefs });
    } catch {
      // Use defaults if fetch fails
    }
  },

  updateLeadTime: async (prayer: Prayer, minutes: number) => {
    const { prayerPrefs } = get();
    try {
      await updatePrayerPrefs(prayer, { leadMinutes: minutes });
      const updated = prayerPrefs.map((p) =>
        p.prayer === prayer ? { ...p, leadMinutes: minutes } : p
      );
      set({ prayerPrefs: updated });
    } catch (error) {
      throw error;
    }
  },

  updateCalcMethod: async (method: number) => {
    try {
      await updateProfile({ calcMethod: method });
      set({ calcMethod: method });
    } catch (error) {
      throw error;
    }
  },

  updateAzanSound: async (sound: string) => {
    try {
      await updateProfile({ azanSound: sound });
      set({ azanSound: sound });
    } catch (error) {
      throw error;
    }
  },
}));
