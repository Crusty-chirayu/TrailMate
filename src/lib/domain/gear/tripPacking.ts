// Trip packing service — manages the snapshot packing state of a trip.
//
// Assignment strategy: SNAPSHOT. When a template is assigned to a trip, item
// data is COPIED into trip_packing_items. Later edits to (or deletion of) the
// source template can never corrupt a trip's historical packing state.
// template_id / source_item_id are stored only as provenance references.
//
// All methods enforce authentication; RLS provides the second ownership layer
// (trip ownership), so cross-user access is impossible even if a service call
// were constructed with a foreign tripId.

import { createClient } from '@/lib/supabase/server'
import type { TripPackingItem, TripPackingItemInsert, TripPackingItemUpdate } from '@/types/database'
import type { PackingItem, PackingProgress, GearCategory } from '@/types/domain'
import { computePackingProgress } from './progress'
import { normalizeCategory, normalizeQuantity, normalizeWeight, validateItemInput } from './validation'

export class TripPackingService {
  private static transformToDomain(db: TripPackingItem): PackingItem {
    return {
      id: db.id,
      tripId: db.trip_id,
      templateId: db.template_id || undefined,
      sourceItemId: db.source_item_id || undefined,
      itemName: db.item_name,
      category: (db.category as GearCategory | null) || undefined,
      quantity: db.quantity,
      weight: db.weight ?? undefined,
      notes: db.notes || undefined,
      required: db.required,
      packed: db.packed,
      packedAt: db.packed_at ? new Date(db.packed_at) : undefined,
      sortOrder: db.sort_order,
      createdAt: new Date(db.created_at),
      updatedAt: new Date(db.updated_at),
    }
  }

  private static async requireUserId(): Promise<string> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('User not authenticated')
    return user.id
  }

  /** All packing items for a trip, in stable category/sort order. */
  static async getPackingItems(tripId: string): Promise<PackingItem[]> {
    const supabase = await createClient()
    await this.requireUserId()

    const { data, error } = await supabase
      .from('trip_packing_items')
      .select('*')
      .eq('trip_id', tripId)
      .order('sort_order', { ascending: true })
      .order('item_name', { ascending: true })

    if (error) throw error
    return data.map(TripPackingService.transformToDomain)
  }

  /**
   * Assign a template to a trip by SNAPSHOT-copying its items. Existing
   * packing items are untouched; assigning the same template repeatedly is
   * idempotent per source item (duplicates by source_item_id are skipped).
   * Returns the items added (empty when everything was already assigned).
   */
  static async assignTemplateToTrip(tripId: string, templateId: string): Promise<PackingItem[]> {
    const supabase = await createClient()
    await this.requireUserId()

    // Verify ownership of both trip and template (RLS enforces as well, but we
    // fail with a clear error instead of an RLS violation).
    const { data: template, error: templateError } = await supabase
      .from('gear_templates')
      .select('id, name')
      .eq('id', templateId)
      .single()
    if (templateError || !template) throw new Error('Template not found')

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id')
      .eq('id', tripId)
      .single()
    if (tripError || !trip) throw new Error('Trip not found')

    const { data: sourceItems, error: itemsError } = await supabase
      .from('gear_items')
      .select('id, item_name, category, quantity, weight, notes, required, sort_order, checked')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true })
    if (itemsError) throw itemsError

    const existing = await supabase
      .from('trip_packing_items')
      .select('source_item_id')
      .eq('trip_id', tripId)
    if (existing.error) throw existing.error
    const alreadyAssigned = new Set(
      (existing.data ?? []).map(row => row.source_item_id).filter((v): v is string => v !== null),
    )

    const toInsert: TripPackingItemInsert[] = (sourceItems ?? [])
      .filter(item => !alreadyAssigned.has(item.id))
      .map(item => ({
        trip_id: tripId,
        template_id: templateId,
        source_item_id: item.id,
        item_name: item.item_name,
        category: item.category,
        quantity: item.quantity,
        weight: item.weight,
        notes: item.notes,
        required: item.required,
        packed: false,
        sort_order: item.sort_order,
      }))

    if (toInsert.length === 0) return []

    const { data: inserted, error: insertError } = await supabase
      .from('trip_packing_items')
      .insert(toInsert)
      .select()
    if (insertError) throw insertError

    return (inserted ?? []).map(TripPackingService.transformToDomain)
  }

  /** Add a single ad-hoc packing item directly to a trip (no template). */
  static async addPackingItem(input: {
    tripId: string
    itemName: string
    category?: string
    quantity?: number
    weight?: number
    notes?: string
    required?: boolean
  }): Promise<PackingItem> {
    const validation = validateItemInput({
      itemName: input.itemName,
      category: input.category ?? null,
      quantity: input.quantity ?? null,
      weight: input.weight ?? null,
      notes: input.notes ?? null,
    })
    if (!validation.valid) throw new Error(validation.errors.join('; '))

    const supabase = await createClient()
    await this.requireUserId()

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id')
      .eq('id', input.tripId)
      .single()
    if (tripError || !trip) throw new Error('Trip not found')

    const { data, error } = await supabase
      .from('trip_packing_items')
      .insert({
        trip_id: input.tripId,
        item_name: input.itemName.trim(),
        category: normalizeCategory(input.category) ?? null,
        quantity: normalizeQuantity(input.quantity),
        weight: normalizeWeight(input.weight) ?? null,
        notes: input.notes || null,
        required: input.required ?? false,
      })
      .select()
      .single()
    if (error) throw error
    return TripPackingService.transformToDomain(data)
  }

  /** Toggle (or explicitly set) the packed state of a packing item. */
  static async setPacked(itemId: string, packed: boolean): Promise<PackingItem> {
    const supabase = await createClient()
    await this.requireUserId()

    const update: TripPackingItemUpdate = { packed, packed_at: packed ? new Date().toISOString() : null }
    const { data, error } = await supabase
      .from('trip_packing_items')
      .update(update)
      .eq('id', itemId)
      .select()
      .single()
    if (error) throw error
    return TripPackingService.transformToDomain(data)
  }

  /** Remove a packing item from a trip (source template items are untouched). */
  static async removePackingItem(itemId: string): Promise<boolean> {
    const supabase = await createClient()
    await this.requireUserId()

    const { error } = await supabase
      .from('trip_packing_items')
      .delete()
      .eq('id', itemId)
    if (error) throw error
    return true
  }

  /** Remove every packing item from a trip (does not touch templates). */
  static async clearPackingList(tripId: string): Promise<boolean> {
    const supabase = await createClient()
    await this.requireUserId()

    const { error } = await supabase
      .from('trip_packing_items')
      .delete()
      .eq('trip_id', tripId)
    if (error) throw error
    return true
  }

  /** Deterministic progress for a trip's packing list. */
  static async getPackingProgress(tripId: string): Promise<PackingProgress> {
    const items = await this.getPackingItems(tripId)
    return computePackingProgress(items)
  }

  /** Quick summary used by the trip detail header. */
  static async getProgressSummary(tripId: string): Promise<{
    totalItems: number
    packedItems: number
    requiredItems: number
    requiredPacked: number
    percentage: number
  }> {
    const p = await this.getPackingProgress(tripId)
    return {
      totalItems: p.totalItems,
      packedItems: p.packedItems,
      requiredItems: p.requiredItems,
      requiredPacked: p.requiredPacked,
      percentage: p.percentage,
    }
  }

  /** Update editable snapshot fields of a packing item. */
  static async updatePackingItem(itemId: string, updates: {
    itemName?: string
    category?: GearCategory
    quantity?: number
    weight?: number
    notes?: string
    required?: boolean
    sortOrder?: number
  }): Promise<PackingItem> {
    const supabase = await createClient()
    await this.requireUserId()

    const update: TripPackingItemUpdate = {}
    if (updates.itemName !== undefined) update.item_name = updates.itemName.trim()
    if (updates.category !== undefined) update.category = updates.category ?? null
    if (updates.quantity !== undefined) update.quantity = updates.quantity
    if (updates.weight !== undefined) update.weight = updates.weight ?? null
    if (updates.notes !== undefined) update.notes = updates.notes || null
    if (updates.required !== undefined) update.required = updates.required
    if (updates.sortOrder !== undefined) update.sort_order = updates.sortOrder

    const { data, error } = await supabase
      .from('trip_packing_items')
      .update(update)
      .eq('id', itemId)
      .select()
      .single()
    if (error) throw error
    return TripPackingService.transformToDomain(data)
  }}

