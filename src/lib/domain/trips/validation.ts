// Trip input validation — single authoritative source for activity, status, and field rules.
// Used by both server services and client forms so the rules never diverge.

import type { ActivityType, Difficulty, TripStatus, Visibility } from '@/types/domain'

export const VALID_ACTIVITY_TYPES: readonly ActivityType[] = ['trekking', 'cycling', 'camping', 'other'] as const
export const VALID_STATUSES: readonly TripStatus[] = ['planned', 'active', 'completed', 'cancelled'] as const
export const VALID_DIFFICULTIES: readonly Difficulty[] = ['easy', 'moderate', 'hard', 'expert'] as const
export const VALID_VISIBILITIES: readonly Visibility[] = ['private', 'shared', 'public'] as const

export function isActivityType(value: string): value is ActivityType {
  return (VALID_ACTIVITY_TYPES as readonly string[]).includes(value)
}

export function isTripStatus(value: string): value is TripStatus {
  return (VALID_STATUSES as readonly string[]).includes(value)
}

export function isDifficulty(value: string): value is Difficulty {
  return (VALID_DIFFICULTIES as readonly string[]).includes(value)
}

export function isVisibility(value: string): value is Visibility {
  return (VALID_VISIBILITIES as readonly string[]).includes(value)
}

export interface TripValidationInput {
  title?: string | null
  description?: string | null
  activityType?: string | null
  plannedDate?: string | Date | null
  startDate?: string | Date | null
  endDate?: string | Date | null
  status?: string | null
  estimatedDistance?: number | string | null
  estimatedElevationGain?: number | string | null
  estimatedDuration?: number | string | null
  difficulty?: string | null
  visibility?: string | null
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  // normalized values when valid (callers may use)
  normalized?: {
    title: string
    activityType: ActivityType
    description?: string
    plannedDate?: Date
    startDate?: Date
    endDate?: Date
    status: TripStatus
    estimatedDistance?: number
    estimatedElevationGain?: number
    estimatedDuration?: number
    difficulty?: Difficulty
    visibility: Visibility
  }
}

const TITLE_MAX = 160
const DESCRIPTION_MAX = 5000

function parseDate(value: string | Date | null | undefined): Date | undefined {
  if (value == null || value === '') return undefined
  if (value instanceof Date) return isNaN(value.getTime()) ? undefined : value
  const d = new Date(value as string)
  return isNaN(d.getTime()) ? undefined : d
}

// Reserved for future numeric strict parsing — kept to satisfy explicit domain distinctions
void (function _useParseOptionalNumber() {
  const _fn = (value: number | string | null | undefined): number | undefined | null => {
    if (value == null || value === '') return undefined
    if (value === null) return null
    const n = typeof value === 'string' ? Number(value) : value
    if (!Number.isFinite(n)) return NaN as unknown as number
    return n
  }
  void _fn
})()

export function validateTripInput(input: TripValidationInput, opts: { isUpdate?: boolean } = {}): ValidationResult {
  const errors: string[] = []
  const isUpdate = opts.isUpdate ?? false

  // Title — required on create, optional on update (but if supplied must be valid)
  if (!isUpdate || input.title !== undefined) {
    const raw = input.title == null ? '' : String(input.title)
    const trimmed = raw.trim()
    if (!trimmed) errors.push('Title is required')
    else if (trimmed.length > TITLE_MAX) errors.push(`Title must be at most ${TITLE_MAX} characters`)
  }

  // Activity — required on create
  if (!isUpdate || input.activityType !== undefined) {
    const v = input.activityType == null ? '' : String(input.activityType)
    if (!v || !isActivityType(v)) {
      errors.push(`Activity must be one of: ${VALID_ACTIVITY_TYPES.join(', ')}`)
    }
  }

  // Status — if supplied must be valid
  if (input.status !== undefined && input.status != null && input.status !== '') {
    const s = String(input.status)
    if (!isTripStatus(s)) errors.push(`Status must be one of: ${VALID_STATUSES.join(', ')}`)
  }

  // Difficulty — if supplied must be valid (empty means clear)
  if (input.difficulty !== undefined && input.difficulty != null && input.difficulty !== '') {
    const d = String(input.difficulty)
    if (!isDifficulty(d)) errors.push(`Difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}`)
  }

  // Visibility — if supplied must be valid
  if (input.visibility !== undefined && input.visibility != null && input.visibility !== '') {
    const v = String(input.visibility)
    if (!isVisibility(v)) errors.push(`Visibility must be one of: ${VALID_VISIBILITIES.join(', ')}`)
  }

  // Description length
  if (input.description != null && String(input.description).length > DESCRIPTION_MAX) {
    errors.push(`Description must be at most ${DESCRIPTION_MAX} characters`)
  }

  // Dates — parse and validate order
  const plannedDate = parseDate(input.plannedDate as string | Date | null)
  const startDate = parseDate(input.startDate as string | Date | null)
  const endDate = parseDate(input.endDate as string | Date | null)

  if (input.plannedDate != null && input.plannedDate !== '' && !plannedDate) errors.push('Planned date is invalid')
  if (input.startDate != null && input.startDate !== '' && !startDate) errors.push('Start date is invalid')
  if (input.endDate != null && input.endDate !== '' && !endDate) errors.push('End date is invalid')

  if (startDate && endDate && endDate < startDate) errors.push('End date must be on or after start date')

  // Numeric estimates — must be finite, >=0 when supplied

  // For validation we treat '' as omitted (caller maps correctly). So check only when not '' and not null/undefined.
  if (input.estimatedDistance != null && input.estimatedDistance !== '' && input.estimatedDistance !== undefined) {
    const n = Number(input.estimatedDistance)
    if (!Number.isFinite(n) || n < 0) errors.push('Estimated distance must be a non-negative number')
    if (Number.isFinite(n) && n >= Infinity) errors.push('Estimated distance must be finite')
  }
  if (input.estimatedElevationGain != null && input.estimatedElevationGain !== '' && input.estimatedElevationGain !== undefined) {
    const n = Number(input.estimatedElevationGain)
    if (!Number.isFinite(n) || n < 0) errors.push('Estimated elevation gain must be a non-negative number')
  }
  if (input.estimatedDuration != null && input.estimatedDuration !== '' && input.estimatedDuration !== undefined) {
    const n = Number(input.estimatedDuration)
    if (!Number.isFinite(n) || n < 0) errors.push('Estimated duration must be a non-negative number')
  }

  if (errors.length > 0) return { valid: false, errors }

  // Build normalized (only when valid)
  const normalized: ValidationResult['normalized'] = {
    title: input.title != null ? String(input.title).trim() : '',
    activityType: (input.activityType as ActivityType) ?? 'trekking',
    status: (input.status as TripStatus) ?? 'planned',
    visibility: (input.visibility as Visibility) ?? 'private',
  }
  if (input.description != null && String(input.description).trim() !== '') normalized.description = String(input.description).trim()
  if (plannedDate) normalized.plannedDate = plannedDate
  if (startDate) normalized.startDate = startDate
  if (endDate) normalized.endDate = endDate
  if (input.difficulty != null && String(input.difficulty) !== '') normalized.difficulty = String(input.difficulty) as Difficulty
  if (input.estimatedDistance != null && input.estimatedDistance !== '' && input.estimatedDistance !== undefined) normalized.estimatedDistance = Number(input.estimatedDistance)
  if (input.estimatedElevationGain != null && input.estimatedElevationGain !== '' && input.estimatedElevationGain !== undefined) normalized.estimatedElevationGain = Number(input.estimatedElevationGain)
  if (input.estimatedDuration != null && input.estimatedDuration !== '' && input.estimatedDuration !== undefined) normalized.estimatedDuration = Number(input.estimatedDuration)

  return { valid: true, errors: [], normalized }
}

/**
 * Parses a raw string query value into a validated ActivityType or undefined.
 * Never throws; returns undefined for missing/invalid so callers can drop the filter.
 */
export function parseActivityFilter(value: string | null | undefined): ActivityType | undefined {
  if (!value) return undefined
  return isActivityType(value) ? value : undefined
}

export function parseStatusFilter(value: string | null | undefined): TripStatus | undefined {
  if (!value) return undefined
  return isTripStatus(value) ? value : undefined
}
