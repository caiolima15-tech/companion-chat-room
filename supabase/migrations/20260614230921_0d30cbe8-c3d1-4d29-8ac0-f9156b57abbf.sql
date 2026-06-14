ALTER TABLE public.job_templates
  ADD COLUMN IF NOT EXISTS idle_animation TEXT,
  ADD COLUMN IF NOT EXISTS face_player_radius DOUBLE PRECISION DEFAULT 4;