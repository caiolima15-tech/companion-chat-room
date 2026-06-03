ALTER TABLE public.map_asset_interactions
  ADD COLUMN IF NOT EXISTS rotation_x double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rotation_z double precision NOT NULL DEFAULT 0;