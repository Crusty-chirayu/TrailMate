// Formatting helpers for the tracking UI. Pure and locale-tunable.

export function formatDistance(meters: number, digits = 1): string {
  if (!Number.isFinite(meters) || meters < 0) meters = 0
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(digits)} km`
}

export function formatSpeed(metersPerSecond: number): string {
  if (!Number.isFinite(metersPerSecond) || metersPerSecond < 0) return '0.0 km/h'
  const kmh = metersPerSecond * 3.6
  return `${kmh.toFixed(1)} km/h`
}

export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0
  const s = Math.floor(totalSeconds % 60)
  const m = Math.floor((totalSeconds / 60) % 60)
  const h = Math.floor(totalSeconds / 3600)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatElevation(meters: number | null): string {
  if (meters === null || !Number.isFinite(meters)) return '—'
  return `${Math.round(meters)} m`
}

export function formatAccuracy(meters: number | undefined): string {
  if (meters === undefined || !Number.isFinite(meters)) return '—'
  return `±${Math.round(meters)} m`
}