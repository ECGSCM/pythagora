import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase.types';
import { config } from '../config';

// Initialize Supabase client with validated config
export const supabase = createClient<Database>(
  config.supabase.url,
  config.supabase.anonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  }
);

// Helper types for better TypeScript support
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

// Authentication helpers
export const auth = {
  signUp: async (email: string, password: string, metadata?: any) => {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    });
  },

  signIn: async (email: string, password: string) => {
    return supabase.auth.signInWithPassword({
      email,
      password
    });
  },

  signOut: async () => {
    return supabase.auth.signOut();
  },

  getCurrentUser: () => {
    return supabase.auth.getUser();
  },

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback);
  }
};

// Database helpers with type assertions for Supabase v2 compatibility
export const db = {
  // Patches
  patches: {
    create: async (patch: TablesInsert<'patches'>) => {
      const client = supabase as SupabaseClient<any>;
      return client.from('patches').insert(patch as any).select().single();
    },

    getById: async (id: string) => {
      return supabase.from('patches').select('*').eq('id', id).single();
    },

    getByOwner: async (ownerId: string) => {
      return supabase.from('patches').select('*').eq('owner', ownerId).order('updated_at', { ascending: false });
    },

    getPublic: async (limit = 20, offset = 0) => {
      return supabase
        .from('patches')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    },

    update: async (id: string, updates: TablesUpdate<'patches'>) => {
      const client = supabase as SupabaseClient<any>;
      return client.from('patches').update(updates as any).eq('id', id).select().single();
    },

    delete: async (id: string) => {
      return supabase.from('patches').delete().eq('id', id);
    }
  },

  // Users
  users: {
    create: async (user: TablesInsert<'users'>) => {
      const client = supabase as SupabaseClient<any>;
      return client.from('users').insert(user as any).select().single();
    },

    getById: async (id: string) => {
      return supabase.from('users').select('*').eq('id', id).single();
    },

    update: async (id: string, updates: TablesUpdate<'users'>) => {
      const client = supabase as SupabaseClient<any>;
      return client.from('users').update(updates as any).eq('id', id).select().single();
    },

    updateRole: async (id: string, role: 'free' | 'premium') => {
      const client = supabase as SupabaseClient<any>;
      return client.from('users').update({ role } as any).eq('id', id);
    }
  },

  // Courses
  courses: {
    getPublic: async () => {
      return supabase
        .from('courses')
        .select(`
          *,
          modules (
            *,
            lessons (*)
          )
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false });
    },

    getById: async (id: string) => {
      return supabase
        .from('courses')
        .select(`
          *,
          modules (
            *,
            lessons (*)
          )
        `)
        .eq('id', id)
        .single();
    }
  },

  // Health frequency presets
  healthPresets: {
    getPublic: async () => {
      return supabase
        .from('health_frequency_presets')
        .select('*')
        .eq('is_public', true)
        .order('category', { ascending: true });
    },

    create: async (preset: TablesInsert<'health_frequency_presets'>) => {
      const client = supabase as SupabaseClient<any>;
      return client.from('health_frequency_presets').insert(preset as any).select().single();
    }
  },

  // Favorites
  favorites: {
    add: async (userId: string, patchId: string) => {
      const client = supabase as SupabaseClient<any>;
      return client.from('user_patch_favorites').insert({ user_id: userId, patch_id: patchId } as any);
    },

    remove: async (userId: string, patchId: string) => {
      return supabase
        .from('user_patch_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('patch_id', patchId);
    },

    getByUser: async (userId: string) => {
      return supabase
        .from('user_patch_favorites')
        .select(`
          patch_id,
          patches (*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    }
  }
};

// Real-time subscriptions
export const realtime = {
  subscribeToPatch: (patchId: string, callback: (payload: any) => void) => {
    return supabase
      .channel(`patch:${patchId}`)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'patches',
          filter: `id=eq.${patchId}`
        },
        callback
      )
      .subscribe();
  },

  subscribeToPublicPatches: (callback: (payload: any) => void) => {
    return supabase
      .channel('public-patches')
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'patches',
          filter: 'is_public=eq.true'
        },
        callback
      )
      .subscribe();
  }
};

export default supabase;
