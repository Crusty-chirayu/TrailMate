import { createClient } from '@/lib/supabase/server'
import type { Trip as TripRow, TripInsert, TripUpdate } from '@/types/database'
import type {
  ActivityType,
  Trip as DomainTrip,
  TripStatus,
  Difficulty,
  Visibility,
} from '@/types/domain'

export interface TripWriteFields {
  title?: string
  description?: string | null
  activityType?: ActivityType
  plannedDate?: Date | null
  startDate?: Date | null
  endDate?: Date | null
  status?: TripStatus
  estimatedDistance?: number | null
  estimatedElevationGain?: number | null
  estimatedDuration?: number | null
  difficulty?: Difficulty | null
  visibility?: Visibility
}

/** Database row to domain mapping. Nullish checks preserve legitimate zeroes. */
export function tripRowToDomain(dbTrip: TripRow): DomainTrip {
  return {
    id: dbTrip.id,
    userId: dbTrip.user_id,
    title: dbTrip.title,
    description: dbTrip.description ?? undefined,
    activityType: dbTrip.activity_type,
    plannedDate: dbTrip.planned_date ? new Date(dbTrip.planned_date) : undefined,
    startDate: dbTrip.start_date ? new Date(dbTrip.start_date) : undefined,
    endDate: dbTrip.end_date ? new Date(dbTrip.end_date) : undefined,
    status: dbTrip.status,
    estimatedDistance: dbTrip.estimated_distance ?? undefined,
    estimatedElevationGain: dbTrip.estimated_elevation_gain ?? undefined,
    estimatedDuration: dbTrip.estimated_duration ?? undefined,
    difficulty: dbTrip.difficulty ?? undefined,
    visibility: dbTrip.visibility,
    createdAt: new Date(dbTrip.created_at),
    updatedAt: new Date(dbTrip.updated_at),
  }
}

export function tripCreateToDatabase(
  domain: TripWriteFields & Pick<DomainTrip, 'title' | 'activityType'>,
  userId: string,
): TripInsert {
  return {
    user_id: userId,
    title: domain.title,
    description: domain.description ?? null,
    activity_type: domain.activityType,
    planned_date: domain.plannedDate?.toISOString() ?? null,
    start_date: domain.startDate?.toISOString() ?? null,
    end_date: domain.endDate?.toISOString() ?? null,
    status: domain.status ?? 'planned',
    estimated_distance: domain.estimatedDistance ?? null,
    estimated_elevation_gain: domain.estimatedElevationGain ?? null,
    estimated_duration: domain.estimatedDuration ?? null,
    difficulty: domain.difficulty ?? null,
    visibility: domain.visibility ?? 'private',
  }
}

/** Maps only supplied fields so a status-only update cannot erase trip data. */
export function tripUpdatesToDatabase(updates: TripWriteFields): TripUpdate {
  const row: TripUpdate = {}
  if (updates.title !== undefined) row.title = updates.title
  if (updates.description !== undefined) row.description = updates.description
  if (updates.activityType !== undefined) row.activity_type = updates.activityType
  if (updates.plannedDate !== undefined) row.planned_date = updates.plannedDate?.toISOString() ?? null
  if (updates.startDate !== undefined) row.start_date = updates.startDate?.toISOString() ?? null
  if (updates.endDate !== undefined) row.end_date = updates.endDate?.toISOString() ?? null
  if (updates.status !== undefined) row.status = updates.status
  if (updates.estimatedDistance !== undefined) row.estimated_distance = updates.estimatedDistance
  if (updates.estimatedElevationGain !== undefined) row.estimated_elevation_gain = updates.estimatedElevationGain
  if (updates.estimatedDuration !== undefined) row.estimated_duration = updates.estimatedDuration
  if (updates.difficulty !== undefined) row.difficulty = updates.difficulty
  if (updates.visibility !== undefined) row.visibility = updates.visibility
  return row
}

export class TripService {

  static async getAllTrips() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return data.map(tripRowToDomain)
  }

  static async getTripById(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error) throw error

    return tripRowToDomain(data)
  }

  static async createTrip(trip: {
    title: string
    description?: string
    activityType: ActivityType
    plannedDate?: Date
    estimatedDistance?: number
    estimatedElevationGain?: number
    estimatedDuration?: number
    difficulty?: Difficulty
  }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const insertData: TripInsert = tripCreateToDatabase(trip, user.id)

    const { data, error } = await supabase
      .from('trips')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error

    return tripRowToDomain(data)
  }

  static async updateTrip(id: string, updates: {
    title?: string
    description?: string | null
    activityType?: ActivityType
    plannedDate?: Date | null
    startDate?: Date | null
    endDate?: Date | null
    status?: TripStatus
    estimatedDistance?: number | null
    estimatedElevationGain?: number | null
    estimatedDuration?: number | null
    difficulty?: Difficulty | null
    visibility?: Visibility
  }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const updateData = tripUpdatesToDatabase(updates)

    const { data, error } = await supabase
      .from('trips')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    return tripRowToDomain(data)
  }

  static async deleteTrip(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const { error } = await supabase
      .from('trips')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error

    return true
  }

  static async getTripsByStatus(status: TripStatus) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (error) throw error

    return data.map(tripRowToDomain)
  }

  static async getTripsByActivityType(activityType: ActivityType) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const { data, error } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', user.id)
      .eq('activity_type', activityType)
      .order('created_at', { ascending: false })

    if (error) throw error

    return data.map(tripRowToDomain)
  }
}
