import { Prayer } from "./types";

// Aladhan API calculation methods
export const CALC_METHODS = {
  MWL: 3, // Muslim World League
  ISNA: 2, // Islamic Society of North America (recommended for Canada)
  EGYPT: 5, // Egyptian General Authority of Survey
  MAKKAH: 4, // Umm Al-Qura University, Makkah
  KARACHI: 1, // University of Islamic Sciences, Karachi
} as const;

export const DEFAULT_CALC_METHOD = CALC_METHODS.ISNA;

// Prayer display names
export const PRAYER_NAMES: Record<Prayer, string> = {
  [Prayer.FAJR]: "Fajr",
  [Prayer.DHUHR]: "Dhuhr",
  [Prayer.ASR]: "Asr",
  [Prayer.MAGHRIB]: "Maghrib",
  [Prayer.ISHA]: "Isha",
  [Prayer.JUMMAH]: "Jumu'ah",
};

// Prayer order for display/iteration
export const PRAYER_ORDER: Prayer[] = [
  Prayer.FAJR,
  Prayer.DHUHR,
  Prayer.ASR,
  Prayer.MAGHRIB,
  Prayer.ISHA,
];

// Default notification lead times (minutes before iqama)
export const DEFAULT_LEAD_MINUTES = 15;
export const MIN_LEAD_MINUTES = 1;
export const MAX_LEAD_MINUTES = 60;

// Location
export const DEFAULT_SEARCH_RADIUS_KM = 20;
export const TRAVEL_DETECTION_THRESHOLD_KM = 2;
export const TRAVEL_DETECTION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Aladhan API
export const ALADHAN_API_BASE = "https://api.aladhan.com/v1";

// Cache durations
export const PRAYER_TIMES_CACHE_HOURS = 24;
export const MOSQUE_CACHE_HOURS = 168; // 1 week
