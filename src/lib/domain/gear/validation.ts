// Shared gear validation.
// Used by BOTH server services and client forms so the rules never diverge.

import type { GearCategory } from '@/types/domain'
import { isGearCategory } from './progress'

export interface GearItemInput {
  itemName?: string | null
  category?: string | null
  quantity?: number | string | null
  weight?: number | string | null // grams per unit
  notes?: string | null
  required?: boolean
}

export interface GearTemplateInput {
  name?: string | null
  description?: string | null
  category?: string | null
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

const MAX_NAME_LENGTH = 100
const MAX_NOTES_LENGTH = 500
const MAX_QUANTITY = 999
const MAX_WEIGHT_GRAMS = 1_000_000 // 1000 kg — beyond any carried gear

export function validateTemplateInput(input: GearTemplateInput): ValidationResult {
  const errors: string[] = []
  const name = input.name?.trim() ?? ''
  if (!name) errors.push('Template name is required')
  if (name.length > MAX_NAME_LENGTH) errors.push(`Template name must be at most ${MAX_NAME_LENGTH} characters`)
  if ((input.description?.length ?? 0) > MAX_NOTES_LENGTH) {
    errors.push(`Description must be at most ${MAX_NOTES_LENGTH} characters`)
  }
  return { valid: errors.length === 0, errors }
}

export function validateItemInput(input: GearItemInput): ValidationResult {
  const errors: string[] = []

  const name = input.itemName?.trim() ?? ''
  if (!name) errors.push('Item name is required')
  if (name.length > MAX_NAME_LENGTH) errors.push(`Item name must be at most ${MAX_NAME_LENGTH} characters`)

  if (input.category != null && input.category !== '' && !isGearCategory(input.category)) {
    errors.push('Unknown category')
  }

  const quantity = input.quantity == null || input.quantity === '' ? 1 : Number(input.quantity)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    errors.push(`Quantity must be a whole number between 1 and ${MAX_QUANTITY}`)
  }

  if (input.weight != null && input.weight !== '') {
    const weight = Number(input.weight)
    if (!Number.isFinite(weight) || weight < 0 || weight > MAX_WEIGHT_GRAMS) {
      errors.push('Weight must be a non-negative number in grams (max 1,000,000)')
    }
  }

  if ((input.notes?.length ?? 0) > MAX_NOTES_LENGTH) {
    errors.push(`Notes must be at most ${MAX_NOTES_LENGTH} characters`)
  }

  return { valid: errors.length === 0, errors }
}

/** Normalized category value or undefined for "no category". */
export function normalizeCategory(category?: string | null): GearCategory | undefined {
  if (category == null || category === '') return undefined
  return isGearCategory(category) ? category : undefined
}

/** Parsed quantity (defaults to 1); callers must validate first. */
export function normalizeQuantity(quantity?: number | string | null): number {
  if (quantity == null || quantity === '') return 1
  return Math.max(1, Math.floor(Number(quantity)))
}

/** Parsed weight in grams, or undefined when absent (never 0-invented). */
export function normalizeWeight(weight?: number | string | null): number | undefined {
  if (weight == null || weight === '') return undefined
  const value = Number(weight)
  return Number.isFinite(value) && value > 0 ? value : undefined
}