import { createClient } from '@/lib/supabase/server'
import type { Trip, TripInsert, TripUpdate } from '@/types/database'
import type { ActivityType, TripStatus, Difficulty, Visibility } from '@/types/domain'

export class TripService {
  private static transformToDomain(dbTrip: Trip) {
    return {
      id: dbTrip.id,
      userId: dbTrip.user_id,
      title: dbTrip.title,
      description: dbTrip.description || undefined,
      activityType: dbTrip.activity_type as ActivityType,
      plannedDate: dbTrip.planned_date ? new Date(dbTrip.planned_date) : undefined,
      startDate: dbTrip.start_date ? new Date(dbTrip.start_date) : undefined,
      endDate: dbTrip.end_date ? new Date(dbTrip.end_date) : undefined,
      status: dbTrip.status as TripStatus,
      estimatedDistance: dbTrip.estimated_distance || undefined,
      estimatedElevationGain: dbTrip.estimated_elevation_gain || undefined,
      estimatedDuration: dbTrip.estimated_duration || undefined,
      difficulty: dbTrip.difficulty as Difficulty | undefined,
      visibility: dbTrip.visibility as Visibility,
      createdAt: new Date(dbTrip.created_at),
      updatedAt: new Date(dbTrip.updated_at),
    }
  }

  private static transformToInsert(domain: {
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
  }, userId: string): TripInsert {
    return {
      user_id: userId,
      title: domain.title || '',
      description: domain.description || null,
      activity_type: domain.activityType || 'other',
      planned_date: domain.plannedDate?.toISOString() || null,
      start_date: domain.startDate?.toISOString() || null,
      end_date: domain.endDate?.toISOString() || null,
      status: domain.status || 'planned',
      estimated_distance: domain.estimatedDistance || null,
      estimated_elevation_gain: domain.estimatedElevationGain || null,
      estimated_duration: domain.estimatedDuration || null,
      difficulty: domain.difficulty || null,
      visibility: domain.visibility || 'private',
    }
  }

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

    return data.map(this.transformToDomain)
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

    return this.transformToDomain(data)
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

    const insertData: TripInsert = this.transformToInsert(trip, user.id)

    const { data, error } = await supabase
      .from('trips')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error

    return this.transformToDomain(data)
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

    const insertData = this.transformToInsert(updates, user.id)
    const updateData: TripUpdate = {
      title: insertData.title,
      description: insertData.description,
      activity_type: insertData.activity_type,
      planned_date: insertData.planned_date,
      start_date: insertData.start_date,
      end_date: insertData.end_date,
      status: insertData.status,
      estimated_distance: insertData.estimated_distance,
      estimated_elevation_gain: insertData.estimated_elevation_gain,
      estimated_duration: insertData.estimated_duration,
      difficulty: insertData.difficulty,
      visibility: insertData.visibility,
    }

    const { data, error } = await supabase
      .from('trips')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    return this.transformToDomain(data)
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

    return data.map(this.transformToDomain)
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

    return data.map(this.transformToDomain)
  }
}
