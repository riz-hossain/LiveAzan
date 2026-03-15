// ─── Enums ───────────────────────────────────────────────────────────────────

export enum Prayer {
  FAJR = "FAJR",
  DHUHR = "DHUHR",
  ASR = "ASR",
  MAGHRIB = "MAGHRIB",
  ISHA = "ISHA",
  JUMMAH = "JUMMAH",
}

export enum AuthProvider {
  GOOGLE = "GOOGLE",
  APPLE = "APPLE",
  MICROSOFT = "MICROSOFT",
  EMAIL = "EMAIL",
}

export enum UserRole {
  USER = "USER",
  MOSQUE_ADMIN = "MOSQUE_ADMIN",
  ADMIN = "ADMIN",
}

export enum NotificationType {
  AZAN = "AZAN",
  SILENT_ALERT = "SILENT_ALERT",
  DEPARTURE_REMINDER = "DEPARTURE_REMINDER",
}

export enum RequestStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  REJECTED = "REJECTED",
}

export enum ScanStatus {
  COMPLETED = "COMPLETED",
  NEEDS_REFRESH = "NEEDS_REFRESH",
}

// ─── Prayer Times ────────────────────────────────────────────────────────────

export interface PrayerTimes {
  fajr: string; // "HH:mm"
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  date: string; // "YYYY-MM-DD"
  method: number;
  latitude: number;
  longitude: number;
}

export interface NextPrayer {
  prayer: Prayer;
  time: string; // "HH:mm"
  timeUntilMs: number;
}

// ─── Mosque ──────────────────────────────────────────────────────────────────

export interface Mosque {
  id: string;
  name: string;
  address: string;
  city: string;
  province: string;
  country: string;
  latitude: number;
  longitude: number;
  phone?: string;
  website?: string;
  hasLiveStream: boolean;
  streamUrl?: string;
  verified: boolean;
  distanceKm?: number; // computed at query time
}

export interface IqamaSchedule {
  id: string;
  mosqueId: string;
  prayer: Prayer;
  iqamaTime: string; // "HH:mm"
  effectiveFrom: string; // ISO date
  effectiveTo?: string;
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  authProvider: AuthProvider;
  emailVerified: boolean;
  defaultLeadMinutes: number;
  calcMethod: number;
  azanSound: string;
  role: UserRole;
}

export interface UserPrayerPreference {
  id: string;
  userId: string;
  prayer: Prayer;
  leadMinutes: number;
  notificationType: NotificationType;
  enabled: boolean;
}

export interface UserMosque {
  userId: string;
  mosqueId: string;
  isPrimary: boolean;
  mosque?: Mosque;
}

// ─── Coverage Request ────────────────────────────────────────────────────────

export interface CoverageRequest {
  id: string;
  userId: string;
  latitude: number;
  longitude: number;
  cityName?: string;
  province?: string;
  country?: string;
  status: RequestStatus;
  adminNotes?: string;
  createdAt: string;
  resolvedAt?: string;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password?: string; // only for EMAIL auth
  displayName?: string;
  authProvider: AuthProvider;
  authProviderId?: string;
}

// ─── Seed Data Format ────────────────────────────────────────────────────────

export interface MosqueSeedFile {
  region: string;
  province: string;
  country: string;
  centerLat: number;
  centerLon: number;
  radiusKm: number;
  lastResearched: string;
  researchedBy: string;
  mosques: MosqueSeedEntry[];
}

export interface MosqueSeedEntry {
  name: string;
  address: string;
  city: string;
  province: string;
  latitude: number;
  longitude: number;
  phone?: string;
  website?: string;
  sources: string[];
  iqama?: {
    fajr?: string;
    dhuhr?: string;
    asr?: string;
    maghrib?: string;
    isha?: string;
    jummah?: string;
  };
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface NearbyMosquesResponse {
  mosques: Mosque[];
  uncoveredArea: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
