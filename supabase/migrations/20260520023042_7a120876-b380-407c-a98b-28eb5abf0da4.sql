ALTER TABLE public.map_assets
  ADD COLUMN IF NOT EXISTS y double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rotation_x double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rotation_z double precision NOT NULL DEFAULT 0;