import * as SecureStore from "expo-secure-store";
import type {
  LoginResponse,
  Mosque,
  IqamaSchedule,
  PrayerTimes,
  NearbyMosquesResponse,
  UserPrayerPreference,
  CoverageRequest,
  Prayer,
  User,
} from "@live-azan/shared";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001/api";
const TOKEN_KEY = "live_azan_token";

// ─── Generic API Client ────────────────────────────────────────────────────

async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message =
      errorBody?.message || errorBody?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function loginApi(
  email: string,
  password: string
): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function registerApi(
  email: string,
  password: string,
  displayName?: string
): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      displayName,
      authProvider: "EMAIL",
    }),
  });
}

export async function oauthLoginApi(
  provider: string,
  providerId: string,
  email: string,
  displayName: string
): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/oauth", {
    method: "POST",
    body: JSON.stringify({
      authProvider: provider,
      authProviderId: providerId,
      email,
      displayName,
    }),
  });
}

// ─── Mosques ─────────────────────────────────────────────────────────────────

export async function fetchMosquesNearby(
  lat: number,
  lon: number,
  radiusKm: number = 25
): Promise<NearbyMosquesResponse> {
  return apiClient<NearbyMosquesResponse>(
    `/mosques/nearby?lat=${lat}&lon=${lon}&radiusKm=${radiusKm}`
  );
}

export async function fetchMosqueById(mosqueId: string): Promise<Mosque> {
  return apiClient<Mosque>(`/mosques/${mosqueId}`);
}

export async function fetchIqama(
  mosqueId: string
): Promise<IqamaSchedule[]> {
  return apiClient<IqamaSchedule[]>(`/mosques/${mosqueId}/iqama`);
}

export async function followMosque(
  mosqueId: string,
  isPrimary: boolean = false
): Promise<void> {
  return apiClient<void>(`/users/me/mosques`, {
    method: "POST",
    body: JSON.stringify({ mosqueId, isPrimary }),
  });
}

export async function unfollowMosque(mosqueId: string): Promise<void> {
  return apiClient<void>(`/users/me/mosques/${mosqueId}`, {
    method: "DELETE",
  });
}

// ─── Prayer Times ────────────────────────────────────────────────────────────

export async function fetchPrayerTimesApi(
  lat: number,
  lon: number,
  date?: string,
  method?: number
): Promise<PrayerTimes> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
  });
  if (date) params.set("date", date);
  if (method !== undefined) params.set("method", method.toString());

  return apiClient<PrayerTimes>(`/prayer-times?${params.toString()}`);
}

// ─── User Profile & Preferences ──────────────────────────────────────────────

export async function updateProfile(
  data: Partial<Pick<User, "displayName" | "calcMethod" | "azanSound">>
): Promise<User> {
  return apiClient<User>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function fetchPrayerPrefs(): Promise<UserPrayerPreference[]> {
  return apiClient<UserPrayerPreference[]>("/users/me/prayer-prefs");
}

export async function updatePrayerPrefs(
  prayer: Prayer,
  data: Partial<Pick<UserPrayerPreference, "leadMinutes" | "notificationType" | "enabled">>
): Promise<UserPrayerPreference> {
  return apiClient<UserPrayerPreference>(`/users/me/prayer-prefs/${prayer}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ─── Iqama Submissions ───────────────────────────────────────────────────────

export async function submitIqamaFromUrl(
  mosqueId: string,
  sourceUrl: string,
  prayerTimes: Record<string, string>
): Promise<{ id: string; message: string; status: string }> {
  return apiClient(`/iqama/mosque/${mosqueId}/submissions`, {
    method: "POST",
    body: JSON.stringify({ sourceUrl, prayerTimes }),
  });
}

// ─── Coverage Requests ───────────────────────────────────────────────────────

export async function requestCoverage(
  lat: number,
  lon: number
): Promise<CoverageRequest> {
  return apiClient<CoverageRequest>("/coverage-requests", {
    method: "POST",
    body: JSON.stringify({ latitude: lat, longitude: lon }),
  });
}

export async function fetchCoverageRequests(): Promise<CoverageRequest[]> {
  return apiClient<CoverageRequest[]>("/coverage-requests");
}
