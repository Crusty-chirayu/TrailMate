import { describe, expect, it } from 'vitest'
import {
  allRequiredPacked,
  computePackingProgress,
  formatWeight,
  groupByCategory,
  isGearCategory,
  remainingRequiredItems,
  totalWeightOf,
} from './progress'
import type { PackingItem } from '@/types/domain'

function item(overrides: Partial<PackingItem> & { itemName: string }): PackingItem {
  return {
    id: overrides.itemName,
    tripId: 'trip-1',
    quantity: 1,
    required: false,
    packed: false,
    sortOrder: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }
}

describe('totalWeightOf', () => {
  it('sums quantity-weighted weights', () => {
    expect(totalWeightOf([
      { quantity: 2, weight: 500, required: true, packed: false },
      { quantity: 1, weight: 1200, required: false, packed: true },
    ])).toBe(2200)
  })

  it('treats missing weight as zero (never invents mass)', () => {
    expect(totalWeightOf([
      { quantity: 3, required: false, packed: false },
      { quantity: 1, weight: 0, required: false, packed: false },
    ])).toBe(0)
  })

  it('returns 0 for an empty list', () => {
    expect(totalWeightOf([])).toBe(0)
  })
})

describe('computePackingProgress', () => {
  it('handles an empty list', () => {
    const p = computePackingProgress([])
    expect(p.totalItems).toBe(0)
    expect(p.percentage).toBe(0)
    expect(p.remainingWeight).toBe(0)
  })

  it('counts required and optional separately', () => {
    const items = [
      item({ itemName: 'Tent', required: true, packed: true, weight: 2000 }),
      item({ itemName: 'Map', required: true, packed: false }),
      item({ itemName: 'Book', required: false, packed: true }),
      item({ itemName: 'Radio', required: false, packed: false, quantity: 2, weight: 150 }),
    ]
    const p = computePackingProgress(items)
    expect(p.totalItems).toBe(4)
    expect(p.packedItems).toBe(2)
    expect(p.requiredItems).toBe(2)
    expect(p.requiredPacked).toBe(1)
    expect(p.optionalItems).toBe(2)
    expect(p.optionalPacked).toBe(1)
    expect(p.percentage).toBe(50)
  })

  it('computes quantity-weighted packed and remaining weight', () => {
    const items = [
      item({ itemName: 'Rope', required: true, packed: true, weight: 700, quantity: 2 }),
      item({ itemName: 'Stove', required: false, packed: false, weight: 300 }),
    ]
    const p = computePackingProgress(items)
    expect(p.totalWeight).toBe(1700)
    expect(p.packedWeight).toBe(1400)
    expect(p.remainingWeight).toBe(300)
  })

  it('is 100% only when everything is packed', () => {
    const items = [
      item({ itemName: 'A', required: true, packed: true }),
      item({ itemName: 'B', packed: true }),
    ]
    expect(computePackingProgress(items).percentage).toBe(100)
  })

  it('rounds percentage deterministically', () => {
    const items = Array.from({ length: 3 }, (_, i) => item({ itemName: `i${i}`, packed: i < 1 }))
    expect(computePackingProgress(items).percentage).toBe(33)
  })
})

describe('groupByCategory', () => {
  it('groups items and follows the display order', () => {
    const groups = groupByCategory([
      item({ itemName: 'Map', category: 'navigation' }),
      item({ itemName: 'Tent', category: 'shelter' }),
      item({ itemName: 'Whistle', category: 'safety' }),
      item({ itemName: 'Spare laces' }),
    ])
    expect(groups.map(g => g.label)).toEqual(['Shelter', 'Navigation', 'Safety', 'Miscellaneous'])
    expect(groups[0].items[0].itemName).toBe('Tent')
  })

  it('omits empty categories and keeps all items accounted for', () => {
    const groups = groupByCategory([
      item({ itemName: 'A', category: 'clothing' }),
      item({ itemName: 'B', category: 'clothing' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(2)
  })

  it('returns no groups for an empty list', () => {
    expect(groupByCategory([])).toEqual([])
  })
})

describe('helpers', () => {
  it('allRequiredPacked ignores optional items', () => {
    expect(allRequiredPacked([item({ itemName: 'A', required: true, packed: true })])).toBe(true)
    expect(allRequiredPacked([item({ itemName: 'A', required: true, packed: false })])).toBe(false)
    expect(allRequiredPacked([item({ itemName: 'A', required: false, packed: false })])).toBe(true)
    expect(allRequiredPacked([])).toBe(true)
  })

  it('remainingRequiredItems lists only unpacked required items', () => {
    const remaining = remainingRequiredItems([
      item({ itemName: 'R1', required: true, packed: false }),
      item({ itemName: 'R2', required: true, packed: true }),
      item({ itemName: 'O1', required: false, packed: false }),
    ])
    expect(remaining.map(i => i.itemName)).toEqual(['R1'])
  })

  it('formatWeight never invents mass and picks sensible units', () => {
    expect(formatWeight(undefined)).toBe('—')
    expect(formatWeight(null)).toBe('—')
    expect(formatWeight(0)).toBe('0 g')
    expect(formatWeight(850)).toBe('850 g')
    expect(formatWeight(1000)).toBe('1.00 kg')
    expect(formatWeight(12345)).toBe('12.3 kg')
  })

  it('isGearCategory accepts known categories only', () => {
    expect(isGearCategory('shelter')).toBe(true)
    expect(isGearCategory('spaceship')).toBe(false)
    expect(isGearCategory(null)).toBe(false)
  })
})
