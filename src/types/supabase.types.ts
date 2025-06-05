// This file is auto-generated based on the Supabase schema
// You can regenerate it using: supabase gen types typescript --local > src/types/supabase.types.ts

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
      users: {
        Row: {
          id: string
          display_name: string
          email: string
          avatar_url: string | null
          role: 'free' | 'premium'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name: string
          email: string
          avatar_url?: string | null
          role?: 'free' | 'premium'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string
          email?: string
          avatar_url?: string | null
          role?: 'free' | 'premium'
          created_at?: string
          updated_at?: string
        }
      }
      patches: {
        Row: {
          id: string
          owner: string
          title: string
          description: string | null
          nodes: Json
          is_public: boolean
          thumbnail_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner: string
          title: string
          description?: string | null
          nodes?: Json
          is_public?: boolean
          thumbnail_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner?: string
          title?: string
          description?: string | null
          nodes?: Json
          is_public?: boolean
          thumbnail_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      courses: {
        Row: {
          id: string
          title: string
          description: string
          level: 'beginner' | 'intermediate' | 'advanced'
          thumbnail_url: string | null
          is_public: boolean
          premium_only: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description: string
          level: 'beginner' | 'intermediate' | 'advanced'
          thumbnail_url?: string | null
          is_public?: boolean
          premium_only?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string
          level?: 'beginner' | 'intermediate' | 'advanced'
          thumbnail_url?: string | null
          is_public?: boolean
          premium_only?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      modules: {
        Row: {
          id: string
          course_id: string
          title: string
          description: string | null
          order_index: number
          created_at: string
        }
        Insert: {
          id?: string
          course_id: string
          title: string
          description?: string | null
          order_index: number
          created_at?: string
        }
        Update: {
          id?: string
          course_id?: string
          title?: string
          description?: string | null
          order_index?: number
          created_at?: string
        }
      }
      lessons: {
        Row: {
          id: string
          module_id: string
          title: string
          content: string
          duration: number | null
          order_index: number
          patch_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          module_id: string
          title: string
          content: string
          duration?: number | null
          order_index: number
          patch_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          module_id?: string
          title?: string
          content?: string
          duration?: number | null
          order_index?: number
          patch_id?: string | null
          created_at?: string
        }
      }
      health_frequency_presets: {
        Row: {
          id: string
          name: string
          frequency: number
          description: string
          scientific_basis: string | null
          category: string
          is_public: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          frequency: number
          description: string
          scientific_basis?: string | null
          category?: string
          is_public?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          frequency?: number
          description?: string
          scientific_basis?: string | null
          category?: string
          is_public?: boolean
          created_at?: string
        }
      }
      user_patch_favorites: {
        Row: {
          user_id: string
          patch_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          patch_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          patch_id?: string
          created_at?: string
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
      user_role: 'free' | 'premium'
      course_level: 'beginner' | 'intermediate' | 'advanced'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}