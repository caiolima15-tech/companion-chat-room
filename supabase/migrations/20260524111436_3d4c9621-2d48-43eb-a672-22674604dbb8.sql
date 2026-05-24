ALTER TABLE public.custom_maps ALTER COLUMN url DROP NOT NULL;
ALTER TABLE public.map_assets ADD COLUMN IF NOT EXISTS map_id text NOT NULL DEFAULT 'bar';
CREATE INDEX IF NOT EXISTS idx_map_assets_map_id ON public.map_assets(map_id);