
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.audio_category AS ENUM (
    'ambient','footstep_walk','footstep_run','car_engine','car_brake','car_horn','object','ui','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.audio_trigger AS ENUM ('always','proximity','interaction');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ audio_clips ============
CREATE TABLE IF NOT EXISTS public.audio_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  category public.audio_category NOT NULL DEFAULT 'other',
  url text NOT NULL,
  storage_path text,
  duration_ms integer,
  size_bytes integer,
  loopable boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audio_clips TO authenticated;
GRANT ALL ON public.audio_clips TO service_role;
ALTER TABLE public.audio_clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audio_clips read all auth" ON public.audio_clips FOR SELECT TO authenticated USING (true);
CREATE POLICY "audio_clips admin insert" ON public.audio_clips FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "audio_clips admin update" ON public.audio_clips FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "audio_clips admin delete" ON public.audio_clips FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER audio_clips_touch BEFORE UPDATE ON public.audio_clips FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ audio_settings ============
CREATE TABLE IF NOT EXISTS public.audio_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'global',
  master_volume double precision NOT NULL DEFAULT 1.0,
  ambient_volume double precision NOT NULL DEFAULT 0.35,
  sfx_volume double precision NOT NULL DEFAULT 0.8,
  voice_volume double precision NOT NULL DEFAULT 1.0,
  engine_volume double precision NOT NULL DEFAULT 0.7,
  footstep_walk_interval_ms integer NOT NULL DEFAULT 410,
  footstep_run_interval_ms integer NOT NULL DEFAULT 250,
  hearing_radius_m double precision NOT NULL DEFAULT 18.0,
  falloff_ref_distance double precision NOT NULL DEFAULT 2.0,
  falloff_max_distance double precision NOT NULL DEFAULT 25.0,
  falloff_rolloff double precision NOT NULL DEFAULT 1.4,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audio_settings TO authenticated;
GRANT ALL ON public.audio_settings TO service_role;
ALTER TABLE public.audio_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audio_settings read all auth" ON public.audio_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "audio_settings admin insert" ON public.audio_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "audio_settings admin update" ON public.audio_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "audio_settings admin delete" ON public.audio_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER audio_settings_touch BEFORE UPDATE ON public.audio_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.audio_settings(scope) VALUES ('global') ON CONFLICT (scope) DO NOTHING;

-- ============ map_ambient_sounds ============
CREATE TABLE IF NOT EXISTS public.map_ambient_sounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.custom_maps(id) ON DELETE CASCADE,
  clip_id uuid REFERENCES public.audio_clips(id) ON DELETE SET NULL,
  volume double precision NOT NULL DEFAULT 0.35,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (map_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_ambient_sounds TO authenticated;
GRANT ALL ON public.map_ambient_sounds TO service_role;
ALTER TABLE public.map_ambient_sounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map_ambient read all auth" ON public.map_ambient_sounds FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_ambient admin insert" ON public.map_ambient_sounds FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "map_ambient admin update" ON public.map_ambient_sounds FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "map_ambient admin delete" ON public.map_ambient_sounds FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER map_ambient_touch BEFORE UPDATE ON public.map_ambient_sounds FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ map_object_sounds ============
CREATE TABLE IF NOT EXISTS public.map_object_sounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES public.custom_maps(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.map_assets(id) ON DELETE CASCADE,
  clip_id uuid NOT NULL REFERENCES public.audio_clips(id) ON DELETE CASCADE,
  volume double precision NOT NULL DEFAULT 0.7,
  radius_m double precision NOT NULL DEFAULT 8.0,
  loop boolean NOT NULL DEFAULT true,
  trigger public.audio_trigger NOT NULL DEFAULT 'proximity',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_map_object_sounds_map ON public.map_object_sounds(map_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_object_sounds TO authenticated;
GRANT ALL ON public.map_object_sounds TO service_role;
ALTER TABLE public.map_object_sounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map_obj_snd read all auth" ON public.map_object_sounds FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_obj_snd admin insert" ON public.map_object_sounds FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "map_obj_snd admin update" ON public.map_object_sounds FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "map_obj_snd admin delete" ON public.map_object_sounds FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER map_obj_snd_touch BEFORE UPDATE ON public.map_object_sounds FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ cars_catalog: clipes por carro ============
ALTER TABLE public.cars_catalog
  ADD COLUMN IF NOT EXISTS accel_clip_id uuid REFERENCES public.audio_clips(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brake_clip_id uuid REFERENCES public.audio_clips(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS horn_clip_id  uuid REFERENCES public.audio_clips(id) ON DELETE SET NULL;

-- ============ Storage bucket policies (bucket criado fora desta migration) ============
DROP POLICY IF EXISTS "audio-clips authed read" ON storage.objects;
CREATE POLICY "audio-clips authed read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'audio-clips');

DROP POLICY IF EXISTS "audio-clips admin write" ON storage.objects;
CREATE POLICY "audio-clips admin write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audio-clips' AND public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "audio-clips admin update" ON storage.objects;
CREATE POLICY "audio-clips admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'audio-clips' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'audio-clips' AND public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "audio-clips admin delete" ON storage.objects;
CREATE POLICY "audio-clips admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'audio-clips' AND public.has_role(auth.uid(),'admin'));
