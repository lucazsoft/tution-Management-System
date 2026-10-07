/**
 * Calculates the great-circle distance between two GPS coordinates in meters
 * using the Haversine formula.
 */
export function calculateDistanceInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's average radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // returns distance in meters
}

/**
 * Bounds for branch geofence configuration.
 *
 * The radius floor exists because a fence smaller than a good GPS fix is
 * unsatisfiable; the ceiling stops a radius so large it silently disables
 * the fence (a 10,000,000 m radius covers the planet).
 */
export const GEOFENCE_LIMITS = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
  radiusMeters: { min: 10, max: 5000 },
  gracePeriodMinutes: { min: 0, max: 240 },
} as const;

export const DEFAULT_RADIUS_METERS = 100;

export type GeofenceField = 'latitude' | 'longitude' | 'radiusMeters' | 'gracePeriodMinutes';

/**
 * Coerces one geofence number from a JSON body and range-checks it.
 *
 * Numeric strings are accepted because the branch and onboarding payloads have
 * always taken them from HTML form inputs. Empty strings, null, booleans and
 * arrays are rejected rather than coerced: `Number('')` and `Number(null)` are
 * both 0, which previously placed branches on the equator at the prime
 * meridian instead of failing the request.
 */
export function readGeofenceNumber(
  value: unknown,
  field: GeofenceField,
): { success: true; data: number } | { success: false; error: string } {
  const limits = GEOFENCE_LIMITS[field];
  if (typeof value !== 'number' && typeof value !== 'string') {
    return { success: false, error: `${field} must be a number.` };
  }
  if (typeof value === 'string' && value.trim() === '') {
    return { success: false, error: `${field} must be a number.` };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { success: false, error: `${field} must be a number.` };
  }
  if (parsed < limits.min || parsed > limits.max) {
    return {
      success: false,
      error: `${field} must be between ${limits.min} and ${limits.max}.`,
    };
  }
  return { success: true, data: parsed };
}

/**
 * Validates the geofence block of a branch create payload, where the centre is
 * mandatory and the radius falls back to [DEFAULT_RADIUS_METERS].
 */
export function parseGeofenceConfig(input: {
  latitude: unknown;
  longitude: unknown;
  radiusMeters?: unknown;
}):
  | { success: true; data: { latitude: number; longitude: number; radiusMeters: number } }
  | { success: false; error: string } {
  const latitude = readGeofenceNumber(input.latitude, 'latitude');
  if (!latitude.success) return latitude;
  const longitude = readGeofenceNumber(input.longitude, 'longitude');
  if (!longitude.success) return longitude;

  let radiusMeters = DEFAULT_RADIUS_METERS;
  if (input.radiusMeters !== undefined && input.radiusMeters !== null && input.radiusMeters !== '') {
    const parsed = readGeofenceNumber(input.radiusMeters, 'radiusMeters');
    if (!parsed.success) return parsed;
    radiusMeters = parsed.data;
  }

  return {
    success: true,
    data: { latitude: latitude.data, longitude: longitude.data, radiusMeters },
  };
}
