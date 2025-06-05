// Database types for Pythagora-Synth

export type User = {
  id: string   // Supabase uid
  display_name: string
  email: string
  avatar_url?: string
  role: 'free' | 'premium'
  created_at: string
  updated_at: string
}

export type Patch = {
  id: string
  owner: string  // FK User.id
  title: string
  description?: string
  nodes: PatchNode[]   // physics objects & synth modules
  created_at: string
  updated_at: string
  is_public: boolean
  thumbnail_url?: string
}

export type PatchNode = {
  id: string
  type: 'marble' | 'ramp' | 'bumper' | 'chime' | 'spinner' | 'funnel' | 'seesaw' | 'bell' | 'gear' | 'osc' | 'filter' | 'lfo' | 'reverb' | 'delay' | 'bitcrusher' | 'chorus'
  position: { x: number, y: number }
  size?: { width: number, height: number }
  params: Record<string, any>    // Tone.js or physics params
  connections?: string[]  // connected node IDs
}

export type HealthFrequencyPreset = {
  id: string
  name: string
  frequency: number
  description: string
  scientific_basis?: string
}

export type Course = {
  id: string
  title: string
  description: string
  level: 'beginner' | 'intermediate' | 'advanced'
  thumbnail_url?: string
  is_public: boolean
  premium_only: boolean
  created_at: string
  updated_at: string
}

export type Module = {
  id: string
  course_id: string
  title: string
  description: string
  order: number
  created_at: string
}

export type Lesson = {
  id: string
  module_id: string
  title: string
  content: string // markdown content
  duration?: number // in minutes
  order: number
  patch_id?: string // optional reference patch
  created_at: string
}