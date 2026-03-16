/**
 * OpenStreetMap Overpass API client — runs directly on the device.
 *
 * Queries OpenStreetMap for mosques near a location as a last-resort
 * fallback when the backend, local bundle, and MAWAQIT are all unavailable.
 * No API key required. Results contain name, coordinates, and any available
 * contact info (phone, website) so the enrichment pipeline can attempt
 * to scrape iqama times from the mosque's website.
 *
 * API: https://overpass-api.de/api/interpreter (POST)
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OverpassMosque {
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  phone?: string;
  website?: string;
}

// ─── API ──────────────────────────────────────────────────────────────────────

/**
 * Search for mosques near (lat, lon) within radiusKm using OpenStreetMap data.
 * Returns an empty array on any error or timeout.
 */
export async function searchOverpassMosques(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<OverpassMosque[]> {
  const radiusM = radiusKm * 1000;
  const query = `[out:json][timeout:25];
(
  node["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusM},${lat},${lon});
  way["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusM},${lat},${lon});
  relation["amenity"="place_of_worship"]["religion"="muslim"](around:${radiusM},${lat},${lon});
);
out center body;`;

  console.log(`[Overpass] querying (${lat.toFixed(4)}, ${lon.toFixed(4)}) r=${radiusKm}km`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[Overpass] HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const results = (data.elements ?? [])
      .map(parseElement)
      .filter((m): m is OverpassMosque => m !== null);
    console.log(`[Overpass] returned ${results.length} mosques`);
    return results;
  } catch (err) {
    console.warn("[Overpass] Search failed:", err);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseElement(el: any): OverpassMosque | null {
  // Coordinates: node has lat/lon directly; way/relation has center
  const latitude = el.lat ?? el.center?.lat;
  const longitude = el.lon ?? el.center?.lon;
  if (!latitude || !longitude) return null;

  const tags = el.tags ?? {};

  const name =
    tags.name || tags["name:en"] || tags["name:ar"] || "Unknown Mosque";

  // Build address from OSM address tags
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:city"],
    tags["addr:province"] || tags["addr:state"],
  ].filter(Boolean);
  const address = parts.join(", ");

  return {
    name: name.trim(),
    latitude,
    longitude,
    address,
    city: tags["addr:city"] ?? "",
    phone: tags.phone || tags["contact:phone"] || undefined,
    website: tags.website || tags["contact:website"] || undefined,
  };
}
