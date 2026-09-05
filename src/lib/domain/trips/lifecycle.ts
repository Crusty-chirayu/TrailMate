// Explicit trip lifecycle state machine.
// Planned -> Active -> Completed, with cancellation branches.
// All transitions are validated here so UI and services agree.

import type { TripStatus } from '@/types/domain'

export type TripTransition = {
  from: TripStatus
  to: TripStatus
}

/**
 * Allowed transitions:
 * - planned   -> active, cancelled
 * - active    -> completed, cancelled
 * - cancelled -> (terminal)
 * - completed -> (terminal)
 */
const ALLOWED: Record<TripStatus, TripStatus[]> = {
  planned: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function canTransition(from: TripStatus, to: TripStatus): boolean {
  if (from === to) return false // no-op transitions are not considered valid transitions
  return ALLOWED[from]?.includes(to) ?? false
}

export function assertCanTransition(from: TripStatus, to: TripStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid trip transition: ${from} → ${to}`)
  }
}

export interface LifecycleDateUpdates {
  startDate?: Date | null
  endDate?: Date | null
}

/**
 * Derives date mutations for a status transition.
 * - planned -> active: sets startDate to now if not already present
 * - active -> completed: sets endDate to now if not already present
 * - any -> cancelled: preserves existing dates (no auto-timestamping; caller may set explicitly)
 * Returns undefined fields as omitted (caller maps only defined).
 */
export function lifecycleDatesForTransition(
  from: TripStatus,
  to: TripStatus,
  current: { startDate?: Date; plannedDate?: Date; endDate?: Date },
  now = new Date(),
): LifecycleDateUpdates {
  if (from === 'planned' && to === 'active') {
    // Set startDate to now only if not already set
    if (!current.startDate) return { startDate: now }
    return {}
  }
  if (from === 'active' && to === 'completed') {
    if (!current.endDate) return { endDate: now }
    return {}
  }
  return {}
}

/**
 * High-level helper used when performing a status update.
 * Validates the transition and returns the date mutations that should be applied
 * alongside the status change. Throws on invalid transition.
 */
export function transitionWithDates(
  from: TripStatus,
  to: TripStatus,
  current: { startDate?: Date; plannedDate?: Date; endDate?: Date },
  now = new Date(),
): LifecycleDateUpdates & { status: TripStatus } {
  assertCanTransition(from, to)
  const dates = lifecycleDatesForTransition(from, to, current, now)
  return { status: to, ...dates }
}
