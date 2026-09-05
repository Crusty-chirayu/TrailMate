// Database type definitions for TrailMate
// These types correspond to the PostgreSQL schema in supabase/schema.sql

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      trips: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          activity_type: 'trekking' | 'cycling' | 'camping' | 'other'
          planned_date: string | null
          start_date: string | null
          end_date: string | null
          status: 'planned' | 'active' | 'completed' | 'cancelled'
          estimated_distance: number | null
          estimated_elevation_gain: number | null
          estimated_duration: number | null
          difficulty: 'easy' | 'moderate' | 'hard' | 'expert' | null
          visibility: 'private' | 'shared' | 'public'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          activity_type: 'trekking' | 'cycling' | 'camping' | 'other'
          planned_date?: string | null
          start_date?: string | null
          end_date?: string | null
          status?: 'planned' | 'active' | 'completed' | 'cancelled'
          estimated_distance?: number | null
          estimated_elevation_gain?: number | null
          estimated_duration?: number | null
          difficulty?: 'easy' | 'moderate' | 'hard' | 'expert' | null
          visibility?: 'private' | 'shared' | 'public'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          activity_type?: 'trekking' | 'cycling' | 'camping' | 'other'
          planned_date?: string | null
          start_date?: string | null
          end_date?: string | null
          status?: 'planned' | 'active' | 'completed' | 'cancelled'
          estimated_distance?: number | null
          estimated_elevation_gain?: number | null
          estimated_duration?: number | null
          difficulty?: 'easy' | 'moderate' | 'hard' | 'expert' | null
          visibility?: 'private' | 'shared' | 'public'
          updated_at?: string
        }
      }
      route_points: {
        Row: {
          id: string
          trip_id: string
          lat: number
          lng: number
          elevation: number | null
          accuracy: number | null
          recorded_at: string
          synced: boolean
          metadata: Json
        }
        Insert: {
          id?: string
          trip_id: string
          lat: number
          lng: number
          elevation?: number | null
          accuracy?: number | null
          recorded_at?: string
          synced?: boolean
          metadata?: Json
        }
        Update: {
          id?: string
          trip_id?: string
          lat?: number
          lng?: number
          elevation?: number | null
          accuracy?: number | null
          recorded_at?: string
          synced?: boolean
          metadata?: Json
        }
      }
      gear_templates: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          category: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          category?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          category?: string | null
          updated_at?: string
        }
      }
      gear_items: {
        Row: {
          id: string
          template_id: string
          item_name: string
          category: string | null
          checked: boolean
          required: boolean
          quantity: number
          weight: number | null
          notes: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          template_id: string
          item_name: string
          category?: string | null
          checked?: boolean
          required?: boolean
          quantity?: number
          weight?: number | null
          notes?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          template_id?: string
          item_name?: string
          category?: string | null
          checked?: boolean
          required?: boolean
          quantity?: number
          weight?: number | null
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
      }
      trip_packing_items: {
        Row: {
          id: string
          trip_id: string
          template_id: string | null
          source_item_id: string | null
          item_name: string
          category: string | null
          quantity: number
          weight: number | null
          notes: string | null
          required: boolean
          packed: boolean
          packed_at: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          template_id?: string | null
          source_item_id?: string | null
          item_name: string
          category?: string | null
          quantity?: number
          weight?: number | null
          notes?: string | null
          required?: boolean
          packed?: boolean
          packed_at?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          template_id?: string | null
          source_item_id?: string | null
          item_name?: string
          category?: string | null
          quantity?: number
          weight?: number | null
          notes?: string | null
          required?: boolean
          packed?: boolean
          packed_at?: string | null
          sort_order?: number
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Convenience types for common operations
export type Trip = Database['public']['Tables']['trips']['Row']
export type TripInsert = Database['public']['Tables']['trips']['Insert']
export type TripUpdate = Database['public']['Tables']['trips']['Update']

export type RoutePoint = Database['public']['Tables']['route_points']['Row']
export type RoutePointInsert = Database['public']['Tables']['route_points']['Insert']
export type RoutePointUpdate = Database['public']['Tables']['route_points']['Update']

export type GearTemplate = Database['public']['Tables']['gear_templates']['Row']
export type GearTemplateInsert = Database['public']['Tables']['gear_templates']['Insert']
export type GearTemplateUpdate = Database['public']['Tables']['gear_templates']['Update']

export type GearItem = Database['public']['Tables']['gear_items']['Row']
export type GearItemInsert = Database['public']['Tables']['gear_items']['Insert']
export type GearItemUpdate = Database['public']['Tables']['gear_items']['Update']

export type TripPackingItem = Database['public']['Tables']['trip_packing_items']['Row']
export type TripPackingItemInsert = Database['public']['Tables']['trip_packing_items']['Insert']
export type TripPackingItemUpdate = Database['public']['Tables']['trip_packing_items']['Update']
