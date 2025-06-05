import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your_default_anon_key';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
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
});

// Helper types for better TypeScript support
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
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

// Database helpers
export const db = {
  // Patches
  patches: {
    create: async (patch: Partial<Tables<'patches'>>) => {
      return supabase.from('patches').insert(patch).select().single();
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

    update: async (id: string, updates: Partial<Tables<'patches'>>) => {
      return supabase.from('patches').update(updates).eq('id', id).select().single();
    },

    delete: async (id: string) => {
      return supabase.from('patches').delete().eq('id', id);
    }
  },

  // Users
  users: {
    create: async (user: Partial<Tables<'users'>>) => {
      return supabase.from('users').insert(user).select().single();
    },

    getById: async (id: string) => {
      return supabase.from('users').select('*').eq('id', id).single();
    },

    update: async (id: string, updates: Partial<Tables<'users'>>) => {
      return supabase.from('users').update(updates).eq('id', id).select().single();
    },

    updateRole: async (id: string, role: 'free' | 'premium') => {
      return supabase.from('users').update({ role }).eq('id', id);
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

    create: async (preset: Partial<Tables<'health_frequency_presets'>>) => {
      return supabase.from('health_frequency_presets').insert(preset).select().single();
    }
  },

  // Favorites
  favorites: {
    add: async (userId: string, patchId: string) => {
      return supabase.from('user_patch_favorites').insert({ user_id: userId, patch_id: patchId });
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