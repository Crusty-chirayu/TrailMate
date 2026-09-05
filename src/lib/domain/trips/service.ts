import { createClient } from '@/lib/supabase/server'
import type { Trip as TripRow, TripInsert, TripUpdate } from '@/types/database'
import type {
  ActivityType,
  Trip as DomainTrip,
  TripStatus,
  Difficulty,
  Visibility,
} from '@/types/domain'
import { validateTripInput, isActivityType } from './validation'
import { assertCanTransition, lifecycleDatesForTransition } from './lifecycle'

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

  static async getFilteredTrips(filters: { search?: string; status?: string; activity?: string }) {
    const all = await TripService.getAllTrips()
    const search = (filters.search ?? '').trim().toLowerCase()
    const normalizedStatus = filters.status?.trim() ?? ''
    const normalizedActivity = filters.activity?.trim() ?? ''
    const validStatus = ['planned', 'active', 'completed', 'cancelled'].includes(normalizedStatus) ? normalizedStatus : undefined
    const validActivity = ['trekking', 'cycling', 'camping', 'other'].includes(normalizedActivity) ? normalizedActivity : undefined
    return all.filter(t => {
      if (validStatus && t.status !== validStatus) return false
      if (validActivity && t.activityType !== validActivity) return false
      if (search && !t.title.toLowerCase().includes(search)) return false
      return true
    })
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
    visibility?: Visibility
    status?: TripStatus
    startDate?: Date
    endDate?: Date
  }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('User not authenticated')
    }

    // Server-side authoritative validation
    const v = validateTripInput(
      {
        title: trip.title,
        description: trip.description ?? null,
        activityType: trip.activityType,
        plannedDate: trip.plannedDate ?? null,
        estimatedDistance: trip.estimatedDistance ?? null,
        estimatedElevationGain: trip.estimatedElevationGain ?? null,
        estimatedDuration: trip.estimatedDuration ?? null,
        difficulty: trip.difficulty ?? null,
        visibility: trip.visibility ?? null,
        status: trip.status ?? null,
        startDate: trip.startDate ?? null,
        endDate: trip.endDate ?? null,
      },
      { isUpdate: false },
    )
    if (!v.valid) throw new Error(v.errors.join('; '))
    if (!isActivityType(trip.activityType)) throw new Error(`Invalid activity_type: ${trip.activityType}`)

    const insertData: TripInsert = tripCreateToDatabase(
      {
        title: trip.title.trim(),
        description: trip.description ?? undefined,
        activityType: trip.activityType,
        plannedDate: trip.plannedDate ?? undefined,
        startDate: trip.startDate ?? undefined,
        endDate: trip.endDate ?? undefined,
        status: trip.status ?? 'planned',
        estimatedDistance: trip.estimatedDistance ?? undefined,
        estimatedElevationGain: trip.estimatedElevationGain ?? undefined,
        estimatedDuration: trip.estimatedDuration ?? undefined,
        difficulty: trip.difficulty ?? undefined,
        visibility: trip.visibility ?? 'private',
      },
      user.id,
    )

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

    // Validate activity if supplied
    if (updates.activityType !== undefined && updates.activityType !== null) {
      if (!isActivityType(updates.activityType as string)) {
        throw new Error(`Invalid activity_type: ${updates.activityType}`)
      }
    }

    // Validate input fields server-side (partial)
    const needsValidation =
      updates.title !== undefined ||
      updates.description !== undefined ||
      updates.activityType !== undefined ||
      updates.plannedDate !== undefined ||
      updates.startDate !== undefined ||
      updates.endDate !== undefined ||
      updates.status !== undefined ||
      updates.difficulty !== undefined ||
      updates.visibility !== undefined ||
      updates.estimatedDistance !== undefined ||
      updates.estimatedElevationGain !== undefined ||
      updates.estimatedDuration !== undefined

    if (needsValidation) {
      const v = validateTripInput(
        {
          title: updates.title as string | null | undefined,
          description: updates.description as string | null | undefined,
          activityType: updates.activityType as string | null | undefined,
          plannedDate: updates.plannedDate as Date | null | undefined,
          startDate: updates.startDate as Date | null | undefined,
          endDate: updates.endDate as Date | null | undefined,
          status: updates.status as string | null | undefined,
          difficulty: updates.difficulty as string | null | undefined,
          visibility: updates.visibility as string | null | undefined,
          estimatedDistance: updates.estimatedDistance as number | null | undefined,
          estimatedElevationGain: updates.estimatedElevationGain as number | null | undefined,
          estimatedDuration: updates.estimatedDuration as number | null | undefined,
        },
        { isUpdate: true },
      )
      if (!v.valid) throw new Error(v.errors.join('; '))
    }

    // Enforce lifecycle if status is changing
    const effectiveUpdates: typeof updates = { ...updates }

    if (updates.status !== undefined) {
      // Need current trip to validate transition and derive dates
      const { data: currentRow, error: fetchError } = await supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()
      if (fetchError) throw fetchError
      const current = tripRowToDomain(currentRow as TripRow)
      if (updates.status !== current.status) {
        assertCanTransition(current.status, updates.status as TripStatus)
        const dates = lifecycleDatesForTransition(current.status, updates.status as TripStatus, {
          startDate: current.startDate,
          plannedDate: current.plannedDate,
          endDate: current.endDate,
        })
        // Only apply auto dates if caller did not explicitly supply that field
        if (dates.startDate !== undefined && effectiveUpdates.startDate === undefined) {
          effectiveUpdates.startDate = dates.startDate ?? null
        }
        if (dates.endDate !== undefined && effectiveUpdates.endDate === undefined) {
          effectiveUpdates.endDate = dates.endDate ?? null
        }
      }
    }

    const updateData = tripUpdatesToDatabase(effectiveUpdates)

    // No-op guard: if caller sent empty object, do not hit DB with empty update
    if (Object.keys(updateData).length === 0) {
      const { data: existing, error: readError } = await supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()
      if (readError) throw readError
      return tripRowToDomain(existing as TripRow)
    }

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

  /** Transition planned → active, setting start_date and preserving other fields. */
  static async startTrip(id: string) {
    return TripService.updateTrip(id, { status: 'active' })
  }

  /** Transition active → completed, setting end_date. */
  static async completeTrip(id: string) {
    return TripService.updateTrip(id, { status: 'completed' })
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
