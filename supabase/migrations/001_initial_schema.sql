-- Pythagora-Synth Database Schema

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'free' CHECK (role IN ('free', 'premium')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Patches table
CREATE TABLE public.patches (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT false,
  thumbnail_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Courses table
CREATE TABLE public.courses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  thumbnail_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  premium_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Modules table
CREATE TABLE public.modules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lessons table
CREATE TABLE public.lessons (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- Markdown content
  duration INTEGER, -- Duration in minutes
  order_index INTEGER NOT NULL,
  patch_id UUID REFERENCES public.patches(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Health frequency presets table
CREATE TABLE public.health_frequency_presets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  frequency DECIMAL NOT NULL,
  description TEXT NOT NULL,
  scientific_basis TEXT,
  category TEXT NOT NULL DEFAULT 'custom',
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User patch favorites (many-to-many)
CREATE TABLE public.user_patch_favorites (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  patch_id UUID NOT NULL REFERENCES public.patches(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, patch_id)
);

-- Indexes for performance
CREATE INDEX idx_patches_owner ON public.patches(owner);
CREATE INDEX idx_patches_public ON public.patches(is_public) WHERE is_public = true;
CREATE INDEX idx_patches_created_at ON public.patches(created_at DESC);
CREATE INDEX idx_modules_course_id ON public.modules(course_id);
CREATE INDEX idx_modules_order ON public.modules(course_id, order_index);
CREATE INDEX idx_lessons_module_id ON public.lessons(module_id);
CREATE INDEX idx_lessons_order ON public.lessons(module_id, order_index);
CREATE INDEX idx_health_presets_category ON public.health_frequency_presets(category);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_frequency_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_patch_favorites ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Patches policies
CREATE POLICY "Users can view own patches" ON public.patches
  FOR SELECT USING (auth.uid() = owner);

CREATE POLICY "Users can view public patches" ON public.patches
  FOR SELECT USING (is_public = true);

CREATE POLICY "Users can insert own patches" ON public.patches
  FOR INSERT WITH CHECK (auth.uid() = owner);

CREATE POLICY "Users can update own patches" ON public.patches
  FOR UPDATE USING (auth.uid() = owner);

CREATE POLICY "Users can delete own patches" ON public.patches
  FOR DELETE USING (auth.uid() = owner);

-- Courses policies
CREATE POLICY "Users can view public courses" ON public.courses
  FOR SELECT USING (is_public = true);

CREATE POLICY "Premium users can view premium courses" ON public.courses
  FOR SELECT USING (
    is_public = true AND (
      NOT premium_only OR 
      EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role = 'premium'
      )
    )
  );

-- Modules policies
CREATE POLICY "Users can view modules of accessible courses" ON public.modules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.courses 
      WHERE id = course_id AND is_public = true AND (
        NOT premium_only OR 
        EXISTS (
          SELECT 1 FROM public.users 
          WHERE id = auth.uid() AND role = 'premium'
        )
      )
    )
  );

-- Lessons policies
CREATE POLICY "Users can view lessons of accessible modules" ON public.lessons
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.modules m
      JOIN public.courses c ON m.course_id = c.id
      WHERE m.id = module_id AND c.is_public = true AND (
        NOT c.premium_only OR 
        EXISTS (
          SELECT 1 FROM public.users 
          WHERE id = auth.uid() AND role = 'premium'
        )
      )
    )
  );

-- Health frequency presets policies
CREATE POLICY "Users can view public health presets" ON public.health_frequency_presets
  FOR SELECT USING (is_public = true);

-- User patch favorites policies
CREATE POLICY "Users can manage own favorites" ON public.user_patch_favorites
  FOR ALL USING (auth.uid() = user_id);

-- Functions for updated_at timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER handle_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_patches_updated_at
  BEFORE UPDATE ON public.patches
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();