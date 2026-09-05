// Domain types for TrailMate business logic
// These represent the application's domain model, separate from database types

export type ActivityType = 'trekking' | 'cycling' | 'camping' | 'other'
export type TripStatus = 'planned' | 'active' | 'completed' | 'cancelled'
export type Difficulty = 'easy' | 'moderate' | 'hard' | 'expert'
export type Visibility = 'private' | 'shared' | 'public'

export type GearCategory = 
  | 'navigation'
  | 'shelter'
  | 'clothing'
  | 'hydration'
  | 'food'
  | 'safety'
  | 'lighting'
  | 'electronics'
  | 'first-aid'
  | 'personal'
  | 'other'

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
  quantity: number
  weight?: number // grams
  notes?: string
  sortOrder: number
  createdAt: Date
}

export interface PackingProgress {
  totalItems: number
  checkedItems: number
  percentage: number
  totalWeight: number // grams
  packedWeight: number // grams
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
