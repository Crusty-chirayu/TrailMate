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
        Relationships: []
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
          source_id: string | null
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
          source_id?: string | null
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
          source_id?: string | null
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'route_points_trip_id_fkey'
            columns: ['trip_id']
            isOneToOne: false
            referencedRelation: 'trips'
            referencedColumns: ['id']
          },
        ]
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
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: 'gear_items_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'gear_templates'
            referencedColumns: ['id']
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: 'trip_packing_items_trip_id_fkey'
            columns: ['trip_id']
            isOneToOne: false
            referencedRelation: 'trips'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'trip_packing_items_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'gear_templates'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'trip_packing_items_source_item_id_fkey'
            columns: ['source_item_id']
            isOneToOne: false
            referencedRelation: 'gear_items'
            referencedColumns: ['id']
          },
        ]
      }
      trip_shares: {
        Row: {
          id: string
          trip_id: string
          token: string
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          token: string
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          token?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'trip_shares_trip_id_fkey'
            columns: ['trip_id']
            isOneToOne: false
            referencedRelation: 'trips'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_shared_trip: {
        Args: { p_token: string }
        Returns: Array<{
          id: string
          title: string
          description: string | null
          activity_type: 'trekking' | 'cycling' | 'camping' | 'other'
          difficulty: 'easy' | 'moderate' | 'hard' | 'expert' | null
          visibility: 'private' | 'shared' | 'public'
          planned_date: string | null
          start_date: string | null
          end_date: string | null
          status: 'planned' | 'active' | 'completed' | 'cancelled'
          estimated_distance: number | null
          estimated_elevation_gain: number | null
          estimated_duration: number | null
        }>
      }
      get_shared_route: {
        Args: { p_token: string }
        Returns: Array<{
          lat: number
          lng: number
          elevation: number | null
          accuracy: number | null
          recorded_at: string
          synced: boolean
        }>
      }
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

export type TripShare = Database['public']['Tables']['trip_shares']['Row']
export type TripShareInsert = Database['public']['Tables']['trip_shares']['Insert']
export type TripShareUpdate = Database['public']['Tables']['trip_shares']['Update']
