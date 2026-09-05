// Pure, deterministic packing calculations.
// No I/O, no React, no time-dependence — fully unit-testable.

import type { GearCategory, PackingItem, PackingProgress } from '@/types/domain'
import { GEAR_CATEGORY_ORDER } from '@/types/domain'

/** Minimal shape the calculators need — works for both template items and packing items. */
export interface PackableItem {
  category?: GearCategory
  quantity: number
  weight?: number // grams per unit
  required: boolean
  packed: boolean
}

/** Total quantity-weighted weight of a set of items (grams). Missing weight contributes nothing. */
export function totalWeightOf(items: ReadonlyArray<PackableItem>): number {
  return items.reduce((sum, item) => sum + (item.weight ?? 0) * item.quantity, 0)
}

/**
 * Deterministic packing progress for a list of items.
 * - required and optional items are counted separately
 * - percentage is based on ALL items (required + optional), rounded to nearest int
 * - weight is quantity-weighted; items without weight never invent mass
 */
export function computePackingProgress(items: ReadonlyArray<PackableItem>): PackingProgress {
  const totalItems = items.length
  const packedItems = items.filter(i => i.packed).length

  const requiredItems = items.filter(i => i.required)
  const optionalItems = items.filter(i => !i.required)
  const requiredPacked = requiredItems.filter(i => i.packed).length
  const optionalPacked = optionalItems.filter(i => i.packed).length

  const totalWeight = totalWeightOf(items)
  const packedWeight = totalWeightOf(items.filter(i => i.packed))

  return {
    totalItems,
    packedItems,
    requiredItems: requiredItems.length,
    requiredPacked,
    optionalItems: optionalItems.length,
    optionalPacked,
    percentage: totalItems > 0 ? Math.round((packedItems / totalItems) * 100) : 0,
    totalWeight,
    packedWeight,
    remainingWeight: totalWeight - packedWeight,
  }
}

export interface CategoryGroup<T> {
  category?: GearCategory
  label: string
  items: T[]
}

/**
 * Groups items by category in a stable, display-ordered sequence.
 * Uncategorized items go last as "Miscellaneous". Empty categories are omitted.
 */
export function groupByCategory<T extends PackableItem & { itemName: string }>(
  items: ReadonlyArray<T>,
): ReadonlyArray<CategoryGroup<T>> {
  const byCategory = new Map<GearCategory | undefined, T[]>()
  for (const item of items) {
    const list = byCategory.get(item.category ?? undefined) ?? []
    list.push(item)
    byCategory.set(item.category ?? undefined, list)
  }

  const groups: CategoryGroup<T>[] = []
  for (const { value, label } of GEAR_CATEGORY_ORDER) {
    const list = byCategory.get(value)
    if (list && list.length > 0) {
      groups.push({ category: value, label, items: list })
      byCategory.delete(value)
    }
  }
  const uncategorized = byCategory.get(undefined)
  if (uncategorized && uncategorized.length > 0) {
    groups.push({ category: undefined, label: 'Miscellaneous', items: uncategorized })
  }
  return groups
}

/** Human-readable weight. Grams below 1 kg, kilograms above. Never invents mass. */
export function formatWeight(grams: number | undefined | null): string {
  if (grams === undefined || grams === null || Number.isNaN(grams)) return '—'
  if (grams === 0) return '0 g'
  if (grams < 1000) return `${Math.round(grams)} g`
  return `${(grams / 1000).toFixed(grams < 10_000 ? 2 : 1)} kg`
}

/** Type guard: is the value a valid GearCategory? */
export function isGearCategory(value: unknown): value is GearCategory {
  return typeof value === 'string' && GEAR_CATEGORY_ORDER.some(c => c.value === value)
}

/** Whether every required item in the list is packed (optional items ignored). */
export function allRequiredPacked(items: ReadonlyArray<PackableItem>): boolean {
  return items.filter(i => i.required).every(i => i.packed)
}

/** Remaining (unpacked) required items, in category order. */
export function remainingRequiredItems(items: ReadonlyArray<PackingItem>): PackingItem[] {
  return items.filter(i => i.required && !i.packed)
}