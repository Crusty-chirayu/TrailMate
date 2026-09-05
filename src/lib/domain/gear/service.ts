import { createClient } from '@/lib/supabase/server'
import type {
  GearTemplate,
  GearTemplateInsert,
  GearTemplateUpdate,
  GearItem,
  GearItemInsert,
  GearItemUpdate,
} from '@/types/database'
import type { GearTemplate as DomainGearTemplate, GearItem as DomainGearItem, PackingProgress, GearCategory } from '@/types/domain'
import { computePackingProgress } from './progress'

export function gearItemRowToDomain(dbItem: GearItem): DomainGearItem {
  return {
    id: dbItem.id,
    templateId: dbItem.template_id,
    itemName: dbItem.item_name,
    category: (dbItem.category as GearCategory | null) ?? undefined,
    checked: dbItem.checked,
    required: dbItem.required,
    quantity: dbItem.quantity,
    weight: dbItem.weight ?? undefined,
    notes: dbItem.notes ?? undefined,
    sortOrder: dbItem.sort_order,
    createdAt: new Date(dbItem.created_at),
    updatedAt: new Date(dbItem.updated_at),
  }
}

export function gearItemToDatabase(domain: {
  templateId: string
  itemName: string
  category?: GearCategory
  checked?: boolean
  required?: boolean
  quantity?: number
  weight?: number
  notes?: string
  sortOrder?: number
}): GearItemInsert {
  return {
    template_id: domain.templateId,
    item_name: domain.itemName,
    category: domain.category ?? null,
    checked: domain.checked ?? false,
    required: domain.required ?? false,
    quantity: domain.quantity ?? 1,
    weight: domain.weight ?? null,
    notes: domain.notes ?? null,
    sort_order: domain.sortOrder ?? 0,
  }
}

export class GearService {
  private static transformTemplateToDomain(dbTemplate: GearTemplate): DomainGearTemplate {
    return {
      id: dbTemplate.id,
      userId: dbTemplate.user_id,
      name: dbTemplate.name,
      description: dbTemplate.description || undefined,
      category: dbTemplate.category || undefined,
      createdAt: new Date(dbTemplate.created_at),
      updatedAt: new Date(dbTemplate.updated_at),
    }
  }

  private static transformTemplateToInsert(domain: {
    name: string
    description?: string
    category?: string
  }, userId: string): GearTemplateInsert {
    return {
      user_id: userId,
      name: domain.name,
      description: domain.description || null,
      category: domain.category || null,
    }
  }

  // Template methods
  static async getAllGearTemplates() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const { data, error } = await supabase
      .from('gear_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return data.map(this.transformTemplateToDomain)
  }

  static async getGearTemplateById(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const { data, error } = await supabase
      .from('gear_templates')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error) throw error

    return this.transformTemplateToDomain(data)
  }

  static async createGearTemplate(template: {
    name: string
    description?: string
    category?: string
  }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const insertData: GearTemplateInsert = this.transformTemplateToInsert(template, user.id)

    const { data, error } = await supabase
      .from('gear_templates')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error

    return this.transformTemplateToDomain(data)
  }

  static async updateGearTemplate(id: string, updates: {
    name?: string
    description?: string
    category?: string
  }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const updateData: GearTemplateUpdate = {
      name: updates.name,
      description: updates.description || null,
      category: updates.category || null,
    }

    const { data, error } = await supabase
      .from('gear_templates')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) throw error

    return this.transformTemplateToDomain(data)
  }

  static async deleteGearTemplate(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const { error } = await supabase
      .from('gear_templates')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error

    return true
  }

  // Item methods
  static async getGearItemsByTemplateId(templateId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const { data, error } = await supabase
      .from('gear_items')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: true })

    if (error) throw error

    return data.map(gearItemRowToDomain)
  }

  static async createGearItem(item: {
    templateId: string
    itemName: string
    category?: GearCategory
    required?: boolean
    quantity?: number
    weight?: number
    notes?: string
    sortOrder?: number
  }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const insertData = gearItemToDatabase(item)

    const { data, error } = await supabase
      .from('gear_items')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error

    return gearItemRowToDomain(data)
  }

  static async updateGearItem(id: string, updates: {
    itemName?: string
    category?: GearCategory
    checked?: boolean
    required?: boolean
    quantity?: number
    weight?: number
    notes?: string
    sortOrder?: number
  }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const updateData: GearItemUpdate = {}
    if (updates.itemName !== undefined) updateData.item_name = updates.itemName
    if (updates.category !== undefined) updateData.category = updates.category || null
    if (updates.checked !== undefined) updateData.checked = updates.checked
    if (updates.required !== undefined) updateData.required = updates.required
    if (updates.quantity !== undefined) updateData.quantity = updates.quantity
    if (updates.weight !== undefined) updateData.weight = updates.weight
    if (updates.notes !== undefined) updateData.notes = updates.notes || null
    if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder

    const { data, error } = await supabase
      .from('gear_items')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return gearItemRowToDomain(data)
  }

  static async deleteGearItem(id: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }

    const { error } = await supabase
      .from('gear_items')
      .delete()
      .eq('id', id)

    if (error) throw error

    return true
  }

  static async calculatePackingProgress(templateId: string): Promise<PackingProgress> {
    const items = await this.getGearItemsByTemplateId(templateId)
    return computePackingProgress(items.map(item => ({
      category: item.category,
      quantity: item.quantity,
      weight: item.weight,
      required: item.required,
      packed: item.checked,
    })))
  }
}
