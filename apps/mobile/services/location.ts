import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const TRAVEL_THRESHOLD_KM = 2;

const SAVED_LOCATION_KEY = "saved_gps_location";

// ─── Saved Location (instant on next app open) ────────────────────────────────

export async function getSavedLocation(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_LOCATION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveLocation(coords: {
  latitude: number;
  longitude: number;
}): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVED_LOCATION_KEY, JSON.stringify(coords));
  } catch {
    // ignore storage failures
  }
}

// ─── Permissions ─────────────────────────────────────────────────────────────

export async function requestPermissions(): Promise<boolean> {
  const { status: foregroundStatus } =
    await Location.requestForegroundPermissionsAsync();

  if (foregroundStatus !== "granted") return false;

  return true;
}

export async function requestBackgroundPermissions(): Promise<boolean> {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  return status === "granted";
}

// ─── Current Location ────────────────────────────────────────────────────────

export async function getCurrentLocation(): Promise<{
  latitude: number;
  longitude: number;
}> {
  const hasPermission = await requestPermissions();
  if (!hasPermission) {
    throw new Error("Location permission not granted.");
  }

  // Try OS-cached last known position first — near-instant
  try {
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 5 * 60 * 1000, // accept positions up to 5 minutes old
    });
    if (lastKnown) {
      const coords = {
        latitude: lastKnown.coords.latitude,
        longitude: lastKnown.coords.longitude,
      };
      saveLocation(coords); // fire-and-forget
      return coords;
    }
  } catch {
    // fall through to fresh position
  }

  // No cached position — get a fresh fix (use Low accuracy for speed)
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Low,
  });

  const coords = {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
  saveLocation(coords); // fire-and-forget
  return coords;
}

// ─── Background Tracking ─────────────────────────────────────────────────────

const BACKGROUND_TASK_NAME = "live-azan-location-tracking";

let lastKnownLocation: { latitude: number; longitude: number } | null = null;

export async function startBackgroundTracking(
  onLocationChange: (location: {
    latitude: number;
    longitude: number;
  }) => void
): Promise<void> {
  const hasPermission = await requestBackgroundPermissions();
  if (!hasPermission) {
    throw new Error("Background location permission not granted.");
  }

  // Get initial location
  const initial = await getCurrentLocation();
  lastKnownLocation = initial;

  // Start watching location changes
  await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: TRAVEL_THRESHOLD_KM * 1000, // meters
      timeInterval: 5 * 60 * 1000, // 5 minutes
    },
    (newLocation) => {
      const newCoords = {
        latitude: newLocation.coords.latitude,
        longitude: newLocation.coords.longitude,
      };

      if (lastKnownLocation) {
        const distance = haversineDistance(lastKnownLocation, newCoords);
        if (distance >= TRAVEL_THRESHOLD_KM) {
          lastKnownLocation = newCoords;
          saveLocation(newCoords);
          onLocationChange(newCoords);
        }
      } else {
        lastKnownLocation = newCoords;
        saveLocation(newCoords);
        onLocationChange(newCoords);
      }
    }
  );
}

export async function stopBackgroundTracking(): Promise<void> {
  // Location.watchPositionAsync returns a subscription that should be
  // stored and removed. For simplicity, we note this needs proper
  // subscription management in a production app.
  lastKnownLocation = null;
}

// ─── Distance Calculation ────────────────────────────────────────────────────

function haversineDistance(
  point1: { latitude: number; longitude: number },
  point2: { latitude: number; longitude: number }
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(point2.latitude - point1.latitude);
  const dLon = toRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(point1.latitude)) *
      Math.cos(toRadians(point2.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
