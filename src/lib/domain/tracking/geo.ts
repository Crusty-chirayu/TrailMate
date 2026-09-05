// Geographic / geodesic helpers used by the tracking domain.
// These are pure functions, kept free of any React, storage, or I/O concerns so
// they can be unit-tested in isolation.

export const EARTH_RADIUS_METERS = 6_371_008.8

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

export function toRadians(degrees: number): number {
  return degrees * DEG_TO_RAD
}

export function toDegrees(radians: number): number {
  return radians * RAD_TO_DEG
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Returns true when the coordinate pair is a plausible WGS84 location.
 * Latitude must be within [-90, 90], longitude within [-180, 180].
 */
export function isValidCoordinate(latitude: number, longitude: number): boolean {
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return false
  if (latitude < -90 || latitude > 90) return false
  if (longitude < -180 || longitude > 180) return false
  return true
}

/**
 * Great-circle distance in meters between two WGS84 coordinates.
 * Uses the Haversine formula, which is accurate to ~0.5% on scales typical of
 * hiking/cycling activities and does not require projection libraries.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
    throw new RangeError('haversineDistance requires valid lat/lon coordinates')
  }

  const phi1 = toRadians(lat1)
  const phi2 = toRadians(lat2)
  const deltaPhi = toRadians(lat2 - lat1)
  const deltaLambda = toRadians(lon2 - lon1)

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
  return EARTH_RADIUS_METERS * c
}

/**
 * Initial bearing (in degrees, 0-360 from true north) between two points.
 */
export function initialBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const phi1 = toRadians(lat1)
  const phi2 = toRadians(lat2)
  const deltaLambda = toRadians(lon2 - lon1)

  const y = Math.sin(deltaLambda) * Math.cos(phi2)
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)

  const bearing = toDegrees(Math.atan2(y, x))
  return (bearing + 360) % 360
}

/** Normalizes any given heading into the [0, 360) range. */
export function normalizeHeading(heading: number): number {
  const normalized = ((heading % 360) + 360) % 360
  return Number.isFinite(normalized) ? normalized : 0
}