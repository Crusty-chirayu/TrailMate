# GPS Tracking Architecture

## Overview
Production-quality browser-based GPS tracking system for TrailMate with offline-first persistence, reliable state management, and graceful failure handling.

## Existing Architecture Integration

### Database Schema (from supabase/schema.sql)
- `route_points` table: lat, lng, elevation, accuracy, recorded_at, synced, metadata
- RLS policies protect via trip ownership
- Indexes on trip_id and recorded_at
- Proper foreign key relationship to trips table

### Domain Types (from src/types/domain.ts)
- `RoutePoint`: Basic GPS waypoint structure
- `RouteStats`: Distance, elevation, duration calculations
- `TrackingState`: Basic status enum
- `TrackingService`: CRUD operations + Haversine distance

### Current Limitations
- No real-time GPS tracking implementation
- No geolocation engine
- No offline persistence
- No sync mechanism
- No tracking UI
- Basic statistics only (no moving time, no real-time updates)

## Enhanced Domain Model

### TrackingStatus
```typescript
type TrackingStatus = 
  | 'idle'           // Not tracking
  | 'requesting'     // Requesting GPS permission
  | 'acquiring'      // Waiting for first position
  | 'tracking'       // Actively recording positions
  | 'paused'         // Temporarily paused
  | 'stopping'       // In process of stopping
  | 'error'          // Recoverable error
  | 'denied'         // GPS permission denied
  | 'unavailable'    // GPS hardware unavailable
```

### TrackingSession
```typescript
interface TrackingSession {
  id: string              // Unique session ID
  tripId: string          // Associated trip
  startedAt: Date        // Session start timestamp
  endedAt?: Date         // Session end timestamp
  pausedAt?: Date         // Last pause timestamp
  resumedAt?: Date        // Last resume timestamp
  status: TrackingStatus  // Current state
  lastPosition?: TrackPoint
  statistics: TrackingStatistics
  pointCount: number
  syncState: SyncState
}
```

### TrackPoint (enhanced)
```typescript
interface TrackPoint {
  id: string              // Unique point ID
  tripId: string          // Associated trip
  sessionId: string       // Tracking session
  latitude: number        // Decimal degrees
  longitude: number       // Decimal degrees
  timestamp: Date         // When recorded
  accuracy?: number       // Horizontal accuracy in meters
  altitude?: number       // Altitude in meters
  altitudeAccuracy?: number
  heading?: number        // Direction in degrees (0-360)
  speed?: number          // Speed in m/s
  synced: boolean         // Server sync status
  metadata?: Record<string, unknown>
}
```

### TrackingStatistics
```typescript
interface TrackingStatistics {
  totalDistance: number         // Meters
  movingTime: number            // Seconds
  elapsedTime: number           // Seconds
  averageSpeed: number          // m/s
  currentSpeed?: number        // m/s
  elevationGain: number         // Meters
  elevationLoss: number         // Meters
  maxElevation: number         // Meters
  minElevation: number         // Meters
  pointCount: number
  lastUpdateTime: Date
}
```

### SyncState
```typescript
type SyncState = 
  | 'synced'         // All points synced
  | 'pending'        // Has unsynced points
  | 'syncing'        // Currently syncing
  | 'failed'         // Sync failed, retryable
```

## Geolocation Engine

### Browser Geolocation API Integration
- Use `navigator.geolocation.watchPosition()` for continuous tracking
- Use `navigator.geolocation.getCurrentPosition()` for single fixes
- Explicit permission request flow
- Configurable options:
  ```typescript
  const geolocationOptions = {
    enableHighAccuracy: true,    // Prefer GPS over WiFi/cell
    timeout: 10000,              // 10 second timeout
    maximumAge: 0,               // No cached positions
  }
  ```

### Position Error Handling
- Handle `PERMISSION_DENIED`: User denied access
- Handle `POSITION_UNAVAILABLE`: GPS hardware issue
- Handle `TIMEOUT`: Position request timed out
- Handle unknown errors gracefully

### Lifecycle Management
- Single watcher per session (prevent duplicates)
- Proper cleanup on stop/unmount
- Stale closure prevention
- React effect dependency management

## GPS Quality Filtering

### Validation Rules
1. **Accuracy Threshold**: Reject points with accuracy > 100 meters
2. **Impossible Jumps**: Reject displacement > 200m/s (720 km/h)
3. **Duplicate Points**: Reject within 2 meters of previous point
4. **Timestamp Ordering**: Ensure timestamps are monotonically increasing
5. **Minimum Displacement**: Only record if moved > 5 meters from previous point
6. **Speed Spikes**: Reject if calculated speed > 25 m/s (90 km/h)

### Filter Implementation
```typescript
interface FilterConfig {
  maxAccuracy: number         // 100 meters
  maxSpeed: number            // 25 m/s
  minDisplacement: number     // 5 meters
  duplicateThreshold: number  // 2 meters
}

function filterPosition(
  position: GeolocationPosition,
  previousPoint?: TrackPoint,
  config: FilterConfig
): boolean | TrackPoint
```

## Distance Calculation

### Existing Implementation
- Haversine formula in `TrackingService.haversineDistance()`
- Earth radius: 6371 km
- Returns distance in meters

### Enhancement Required
- Add unit tests for edge cases
- Handle invalid coordinates
- Add geodesic calculations for better long-distance accuracy

## Elevation Handling

### Calculation Logic
- Total ascent: Sum of positive elevation changes
- Total descent: Sum of negative elevation changes
- Max/min elevation: Track across all points
- Graceful degradation when altitude unavailable

### Missing Altitude
- UI shows "Elevation: N/A" when unavailable
- Do not fabricate elevation data
- Statistics exclude missing altitude from calculations

## Time Tracking

### Elapsed Time
- `now - session.startedAt` (excluding pause periods)
- Total pause duration subtracted from elapsed
- Uses timestamps, not counters

### Moving Time
- Time during which user is meaningfully moving
- Calculated from points with speed > 0.5 m/s
- More accurate than simple elapsed time for hiking

### Implementation
```typescript
calculateElapsedTime(session: TrackingSession): number
calculateMovingTime(points: TrackPoint[]): number
```

## Persistence Architecture

### Local Storage Strategy
- **IndexedDB** for robust offline storage
- Store sessions and points locally first
- Async sync with Supabase when connectivity permits
- Browser restart recovery

### IndexedDB Schema
```typescript
interface TrackingDB {
  sessions: {
    key: string              // session ID
    value: TrackingSession
    indexes: ['tripId', 'status']
  }
  points: {
    key: string              // point ID
    value: TrackPoint
    indexes: ['sessionId', 'synced', 'timestamp']
  }
}
```

### Write Pattern
1. Validate/filter incoming GPS point
2. Write to IndexedDB immediately
3. Update in-memory tracking state
4. Queue for server sync
5. Attempt async sync when network available

### Read Pattern
1. Check IndexedDB for active session on load
2. Recover session state if tracking was interrupted
3. Resume from last valid position
4. Preserve accumulated statistics

## Sync Model

### Sync States
- `local-only`: Point stored locally, not attempted sync
- `pending-sync`: Awaiting network or retry
- `synced`: Successfully synced to server
- `sync-failed`: Sync failed, will retry

### Sync Strategy
- Batch sync for efficiency (upload 10-50 points at once)
- Preserve point ordering by timestamp
- Deduplicate by point ID
- Exponential backoff on failure
- Sync queue prioritization

### Offline Recovery
- Points continue recording offline
- Sync queue persists in IndexedDB
- Automatic retry when connectivity returns
- User notified of offline state

## Supabase Integration

### Schema Compatibility
- Use existing `route_points` table
- Add `session_id` column if needed for tracking sessions
- Add `heading` and `speed` columns if beneficial
- Ensure RLS policies remain intact

### Migration Plan
```sql
-- Add tracking-specific columns
ALTER TABLE route_points 
ADD COLUMN session_id UUID,
ADD COLUMN heading DOUBLE PRECISION,
ADD COLUMN speed DOUBLE PRECISION;

-- Add index for session-based queries
CREATE INDEX idx_route_points_session_id ON route_points(session_id);
```

### Data Flow
1. Client captures GPS point
2. Client validates and filters
3. Client stores in IndexedDB
4. Client uploads to Supabase via TrackingService
5. Server validates RLS
6. Server stores in route_points table
7. Client marks point as synced

## Tracking UI Design

### Mobile-First Approach
- Large touch targets (min 44px)
- Clear visual hierarchy
- High contrast for outdoor visibility
- Information density prioritized over decoration

### Key Information Display
- Current position coordinates
- GPS accuracy indicator
- Distance traveled
- Elapsed time
- Current speed
- Elevation (when available)
- Tracking status

### Controls
- Start/Stop (large, prominent)
- Pause/Resume (medium)
- Finish trip (confirm dialog)
- Settings (accuracy thresholds, sync frequency)

### Status Communication
- "Acquiring GPS signal..."
- "GPS accuracy: 8m"
- "Recording"
- "Paused"
- "Offline - saving locally"
- "Syncing..."
- "Saved"

## Component Architecture

### TrackingEngine (Domain Layer)
- Geolocation management
- Position filtering
- Statistics calculation
- Session lifecycle

### TrackingPersistence (Storage Layer)
- IndexedDB operations
- Sync queue management
- Offline detection

### TrackingUI (Presentation Layer)
- Status display
- Control buttons
- Statistics cards
- Error messages

### React Integration
- Custom hook: `useTracking(tripId)`
- Context: `TrackingContext` for global state
- Component: `TrackingDashboard` for main UI

## Testing Strategy

### Unit Tests
- Distance calculation (Haversine)
- Elevation calculations
- Time calculations
- Position filtering logic
- Statistics aggregation

### Integration Tests
- Geolocation engine lifecycle
- IndexedDB operations
- Sync queue processing
- Error recovery

### E2E Tests
- Start tracking flow
- Pause/resume flow
- Offline tracking
- Sync recovery
- Error states

## Performance Considerations

### Long-Running Sessions
- Batch UI updates (throttle to 1-2 Hz)
- Memoize expensive calculations
- Use requestAnimationFrame for animations
- Debounce sync operations

### Memory Management
- Limit in-memory point cache (keep last 1000 points)
- Archive older points to IndexedDB
- Clean up on session completion
- Prevent memory leaks

### Battery Optimization
- Adjust GPS update frequency based on speed
- Reduce accuracy when moving slowly
- Suspend tracking when app backgrounded
- Allow user to tune power/accuracy tradeoff

## Known Limitations

1. Browser GPS limitations (hardware dependent)
2. No map visualization in initial implementation
3. No GPX export/import initially
4. Basic geolocation filtering (can be enhanced)
5. IndexedDB quota limits (typically 50MB)
6. Battery drain during continuous tracking

## Implementation Phases

### Phase 7A: Tracking Domain
- Enhanced type definitions
- Tracking session model
- Statistics calculation enhancements

### Phase 7B: Geolocation Engine
- Browser Geolocation API integration
- Position filtering
- Error handling

### Phase 7C: Persistence
- IndexedDB setup
- Local storage operations
- Offline detection

### Phase 7D: Sync
- Sync queue implementation
- Network detection
- Retry logic

### Phase 7E: Tracking UI
- React components
- Status display
- Control buttons

### Phase 7F: Integration
- Connect all components
- End-to-end testing
- Error recovery

### Phase 7G: Testing
- Unit tests
- Integration tests
- E2E tests

### Phase 7H: Production Hardening
- Performance optimization
- Battery optimization
- Accessibility review
- Documentation

## Success Criteria

Phase 7 complete when:
- Real GPS positions are obtained and filtered
- Tracking engine records points accurately
- Distance and statistics are calculated correctly
- Sessions can start/pause/resume/finish
- Data persists reliably offline
- Offline periods do not destroy data
- Data synchronizes safely with Supabase
- Tracking UI is usable on mobile
- Implementation is tested
- Production build passes
- Changes committed and pushed to GitHub
