// Domain types for TrailMate business logic
// These represent the application's domain model, separate from database types

export type ActivityType = 'trekking' | 'cycling' | 'camping' | 'other'
export type TripStatus = 'planned' | 'active' | 'completed' | 'cancelled'
export type Difficulty = 'easy' | 'moderate' | 'hard' | 'expert'
export type Visibility = 'private' | 'shared' | 'public'

export type GearCategory =
  | 'navigation'
  | 'shelter'
  | 'sleeping'
  | 'clothing'
  | 'cooking'
  | 'hydration'
  | 'food'
  | 'safety'
  | 'first-aid'
  | 'lighting'
  | 'electronics'
  | 'tools'
  | 'personal'
  | 'other'

/** Display order + labels for gear categories (deterministic grouping). */
export const GEAR_CATEGORY_ORDER: ReadonlyArray<{ value: GearCategory; label: string }> = [
  { value: 'shelter', label: 'Shelter' },
  { value: 'sleeping', label: 'Sleeping' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'navigation', label: 'Navigation' },
  { value: 'food', label: 'Food & Water' },
  { value: 'hydration', label: 'Hydration' },
  { value: 'cooking', label: 'Cooking' },
  { value: 'safety', label: 'Safety' },
  { value: 'first-aid', label: 'First Aid' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'tools', label: 'Tools' },
  { value: 'personal', label: 'Personal' },
  { value: 'other', label: 'Miscellaneous' },
]

export interface Trip {
  id: string
  userId: string
  title: string
  description?: string
  activityType: ActivityType
  plannedDate?: Date
  startDate?: Date
  endDate?: Date
  status: TripStatus
  estimatedDistance?: number // meters
  estimatedElevationGain?: number // meters
  estimatedDuration?: number // minutes
  difficulty?: Difficulty
  visibility: Visibility
  createdAt: Date
  updatedAt: Date
}

export interface RoutePoint {
  id: string
  tripId: string
  lat: number
  lng: number
  elevation?: number // meters
  accuracy?: number // meters
  recordedAt: Date
  synced: boolean
  metadata?: Record<string, unknown>
}

export interface RouteStats {
  totalDistance: number // meters
  totalElevationGain: number // meters
  totalElevationLoss: number // meters
  maxElevation: number // meters
  minElevation: number // meters
  duration: number // seconds
  averageSpeed?: number // m/s
  pointCount: number
}

export interface GearTemplate {
  id: string
  userId: string
  name: string
  description?: string
  category?: string
  createdAt: Date
  updatedAt: Date
}

export interface GearItem {
  id: string
  templateId: string
  itemName: string
  category?: GearCategory
  checked: boolean
  required: boolean
  quantity: number
  weight?: number // grams per unit
  notes?: string
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

/**
 * A trip's packing item — a SNAPSHOT copied from a gear template item at
 * assignment time. Later edits to the source template never affect this data,
 * so a trip's historical packing state stays stable. templateId/sourceItemId
 * are kept only as provenance references.
 */
export interface PackingItem {
  id: string
  tripId: string
  templateId?: string
  sourceItemId?: string
  itemName: string
  category?: GearCategory
  quantity: number
  weight?: number // grams per unit
  notes?: string
  required: boolean
  packed: boolean
  packedAt?: Date
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export interface PackingProgress {
  totalItems: number
  packedItems: number
  requiredItems: number
  requiredPacked: number
  optionalItems: number
  optionalPacked: number
  percentage: number // 0-100, rounded
  totalWeight: number // grams, quantity-weighted
  packedWeight: number // grams
  remainingWeight: number // grams
}

export interface TrackingState {
  status: 'idle' | 'requesting' | 'acquiring' | 'tracking' | 'paused' | 'error' | 'denied' | 'unavailable'
  error?: string
  points: RoutePoint[]
  currentPoint?: RoutePoint
  stats?: RouteStats
}

export interface FilterOptions {
  status?: TripStatus[]
  activityType?: ActivityType[]
  dateRange?: { start: Date; end: Date }
  search?: string
}
