/**
 * Geocoding via Nominatim OpenStreetMap
 * Free geocoding service, no API key required
 * Per AGENTS.md Section 5
 */

import { GeocodedAddress, GeocodingFailedError } from "./types";

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_USER_AGENT = "SignalRent/1.0 (contact@signalrent.com)";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Geocode a US address using Nominatim
 * @param address - The address to geocode
 * @returns GeocodedAddress with lat, lng, displayName
 * @throws GeocodingFailedError if no results found
 */
export async function geocodeAddress(
  address: string
): Promise<GeocodedAddress> {
  const params = new URLSearchParams({
    q: address,
    format: "json",
    limit: "1",
    countrycodes: "us",
  });

  const url = `${NOMINATIM_BASE_URL}?${params}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": NOMINATIM_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const results: NominatimResult[] = await response.json();

    if (!results || results.length === 0) {
      throw new GeocodingFailedError(address);
    }

    const result = results[0];

    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      displayName: result.display_name,
    };
  } catch (error) {
    if (error instanceof GeocodingFailedError) {
      throw error;
    }
    throw new GeocodingFailedError(address);
  }
}
