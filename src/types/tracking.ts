// Domain types for the GPS tracking system.
// These models are deliberately separated from database row types so that the
// tracking domain can be tested and reasoned about independent of storage.

/**
 * Lifecycle of a tracking session.
 * - idle       : no session / before first acquisition
 * - acquiring  : GPS permission requested; waiting for the first valid fix
 * - tracking    : actively recording positions
 * - paused     : recording suspended, route + statistics preserved
 * - stopping    : transient state while the session is finalizing
 * - completed  : session finished and finalized
 * - error      : a recoverable GPS/system error occurred
 * - denied     : the user denied GPS permission
 * - unavailable : GPS hardware/service is not available
 */
export type TrackingStatus =
  | 'idle'
  | 'acquiring'
  | 'tracking'
  | 'paused'
  | 'stopping'
  | 'completed'
  | 'error'
  | 'denied'
  | 'unavailable'

/**
 * Synchronization state of a session's recorded points.
 * - local    : points exist only locally (never been sent)
 * - queued   : unsynchronized points are awaiting upload
 * - syncing  : an upload batch is currently in flight
 * - retrying : the last upload failed and a retry timer is scheduled
 * - synced   : all points have been uploaded
 * - failed   : retries are paused and require an explicit retry
 */
export type SyncState = 'local' | 'queued' | 'syncing' | 'retrying' | 'synced' | 'failed'

/** Machine-readable sync engine snapshot for UI rendering. */
export interface SyncEngineStatus {
  state: SyncState
  nextRetryAt: number | null
  attempts: number
  paused: boolean
}

/** Durability state of the local session record in IndexedDB. */
export type PersistenceState = 'none' | 'persisted' | 'error'

/** A single accepted GPS fix within a tracking session. */
export interface TrackPoint {
  /** Client-generated unique id. Also used as the deduplication key during sync. */
  id: string
  /** Owning account. Present on all v2 records; legacy records gain it at migration. */
  userId?: string
  tripId: string
  sessionId: string
  /** Epoch milliseconds (UTC). Never derived from counters. */
  timestamp: number
  latitude: number
  longitude: number
  /** Horizontal accuracy in meters, when reported. */
  accuracy?: number
  /** Altitude in meters above sea level, when reported. */
  altitude?: number
  /** Vertical accuracy in meters, when reported. */
  altitudeAccuracy?: number
  /** Heading in degrees (0-360, true north), when reported. */
  heading?: number
  /** Ground speed in meters per second, when reported. */
  speed?: number
  /** Whether this point has been acknowledged by the server sync. */
  synced: boolean
  /** True when the point can never be uploaded (e.g. trip deleted remotely). */
  quarantined?: boolean
  /** Human-readable reason for quarantine, for diagnostics only. */
  quarantineReason?: string
  metadata?: Record<string, unknown>
}

/** Computed metrics for a session. All numeric fields are plain numbers. */
export interface TrackingStatistics {
  /** Total distance travelled in meters. */
  distance: number
  /** Time spent actually moving, in seconds. */
  movingTime: number
  /** Wall-clock time since the session started, in seconds. */
  elapsedTime: number
  /** Average moving speed in meters per second (distance / movingTime). */
  averageSpeed: number
  /** Most recent speed in meters per second. */
  currentSpeed: number
  /** Cumulative ascent in meters. Only counts pairs with altitude. */
  elevationGain: number
  /** Cumulative descent in meters. Only counts pairs with altitude. */
  elevationLoss: number
  /** Highest recorded altitude in meters, or null when no altitude exists. */
  highestElevation: number | null
  /** Lowest recorded altitude in meters, or null when no altitude exists. */
  lowestElevation: number | null
  /** Whether any altitude data exists (never fabricated). */
  hasElevation: boolean
  /** Number of accepted points. */
  pointCount: number
}

/**
 * An active or archived tracking run bound to a trip.
 * State is intentionally kept small: coordinates live in durable IndexedDB
 * storage rather than being held in-memory (thousands of points per hike).
 */
export interface TrackingSession {
  id: string
  /** Owning account. Present on all v2 records; legacy records gain it at migration. */
  userId?: string
  tripId: string
  startedAt: number
  endedAt?: number
  pausedAt?: number
  resumedAt?: number
  status: TrackingStatus
  lastPosition?: TrackPoint
  pointCount: number
  statistics: TrackingStatistics
  syncState: SyncState
  persistenceState: PersistenceState
  updatedAt: number
  /** User-facing label (e.g. the trip title) for recovery UI. */
  tripTitle?: string
}

/** Options that tune GPS quality acceptance thresholds. */
export interface TrackFilterConfig {
  /** Reject fixes with horizontal accuracy worse than this (meters). */
  maxAccuracyM?: number
  /** Reject fixes older than this relative to the current time (ms). */
  maxAgeMs?: number
  /** Reject instantaneous speeds above this (m/s). */
  maxSpeedMps?: number
  /** Reject a single segment that covers this distance (m) in almost no time. */
  jumpDistanceM?: number
  /** Ignore a new fix that is within this distance (m) of the previous fix. */
  minDistanceM?: number
  /** Ignore a duplicate fix emitted within this window of the previous (ms). */
  duplicateTimeMs?: number
  /** Minimum speed (m/s) below which a segment counts as not moving. */
  movingSpeedMps?: number
}

export const DEFAULT_TRACK_FILTER: TrackFilterConfig = {
  maxAccuracyM: 120,
  maxAgeMs: 90_000,
  maxSpeedMps: 60, // ~216 km/h is implausible for a trail activity
  jumpDistanceM: 80,
  minDistanceM: 0.3,
  duplicateTimeMs: 1_000,
  movingSpeedMps: 0.3,
}

/** Result of evaluating an incoming GPS fix against quality rules. */
export interface PositionEvaluation {
  accepted: boolean
  reason?: 'invalid' | 'duplicate' | 'stale' | 'poor-accuracy' | 'jump' | 'speed-spike' | 'accepted'
}