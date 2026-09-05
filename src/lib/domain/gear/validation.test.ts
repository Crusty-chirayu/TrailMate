import { describe, expect, it } from 'vitest'
import {
  normalizeCategory,
  normalizeQuantity,
  normalizeWeight,
  validateItemInput,
  validateTemplateInput,
} from './validation'

describe('validateTemplateInput', () => {
  it('requires a name', () => {
    expect(validateTemplateInput({ name: '' }).valid).toBe(false)
    expect(validateTemplateInput({ name: '   ' }).valid).toBe(false)
    expect(validateTemplateInput({ name: 'Weekend Hike' }).valid).toBe(true)
  })

  it('enforces name length', () => {
    expect(validateTemplateInput({ name: 'x'.repeat(101) }).valid).toBe(false)
    expect(validateTemplateInput({ name: 'x'.repeat(100) }).valid).toBe(true)
  })

  it('trims whitespace around the name', () => {
    const r = validateTemplateInput({ name: '  Rainy Trek  ' })
    expect(r.valid).toBe(true)
  })
})

describe('validateItemInput', () => {
  it('requires an item name', () => {
    expect(validateItemInput({ itemName: '' }).valid).toBe(false)
    expect(validateItemInput({ itemName: 'Tent' }).valid).toBe(true)
  })

  it('accepts quantity 1..999 and rejects others', () => {
    expect(validateItemInput({ itemName: 'A', quantity: 1 }).valid).toBe(true)
    expect(validateItemInput({ itemName: 'A', quantity: 999 }).valid).toBe(true)
    expect(validateItemInput({ itemName: 'A', quantity: 0 }).valid).toBe(false)
    expect(validateItemInput({ itemName: 'A', quantity: -2 }).valid).toBe(false)
    expect(validateItemInput({ itemName: 'A', quantity: 2.5 }).valid).toBe(false)
    expect(validateItemInput({ itemName: 'A', quantity: 1000 }).valid).toBe(false)
  })

  it('treats missing quantity as valid (defaults to 1)', () => {
    expect(validateItemInput({ itemName: 'A' }).valid).toBe(true)
  })

  it('validates weight range and type', () => {
    expect(validateItemInput({ itemName: 'A', weight: 0 }).valid).toBe(true)
    expect(validateItemInput({ itemName: 'A', weight: 1500 }).valid).toBe(true)
    expect(validateItemInput({ itemName: 'A', weight: -1 }).valid).toBe(false)
    expect(validateItemInput({ itemName: 'A', weight: 'abc' }).valid).toBe(false)
    expect(validateItemInput({ itemName: 'A', weight: 2_000_000 }).valid).toBe(false)
  })

  it('rejects unknown categories', () => {
    expect(validateItemInput({ itemName: 'A', category: 'shelter' }).valid).toBe(true)
    expect(validateItemInput({ itemName: 'A', category: 'spaceship' }).valid).toBe(false)
    expect(validateItemInput({ itemName: 'A', category: '' }).valid).toBe(true)
    expect(validateItemInput({ itemName: 'A', category: null }).valid).toBe(true)
  })

  it('enforces notes length', () => {
    expect(validateItemInput({ itemName: 'A', notes: 'x'.repeat(501) }).valid).toBe(false)
    expect(validateItemInput({ itemName: 'A', notes: 'x'.repeat(500) }).valid).toBe(true)
  })
})

describe('normalizers', () => {
  it('normalizeCategory maps to valid categories only', () => {
    expect(normalizeCategory('shelter')).toBe('shelter')
    expect(normalizeCategory('')).toBeUndefined()
    expect(normalizeCategory(null)).toBeUndefined()
    expect(normalizeCategory('bogus')).toBeUndefined()
  })

  it('normalizeQuantity defaults to 1 and floors', () => {
    expect(normalizeQuantity(undefined)).toBe(1)
    expect(normalizeQuantity('')).toBe(1)
    expect(normalizeQuantity(3)).toBe(3)
    expect(normalizeQuantity('4')).toBe(4)
    expect(normalizeQuantity(0)).toBe(1)
    expect(normalizeQuantity(2.9)).toBe(2)
  })

  it('normalizeWeight returns undefined for missing/invalid, never invents 0', () => {
    expect(normalizeWeight(undefined)).toBeUndefined()
    expect(normalizeWeight(null)).toBeUndefined()
    expect(normalizeWeight('')).toBeUndefined()
    expect(normalizeWeight(0)).toBeUndefined()
    expect(normalizeWeight(-5)).toBeUndefined()
    expect(normalizeWeight('750')).toBe(750)
    expect(normalizeWeight(1.5)).toBe(1.5)
  })
})
