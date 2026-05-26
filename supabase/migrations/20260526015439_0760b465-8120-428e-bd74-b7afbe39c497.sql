CREATE TABLE public.map_asset_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  map_id text NOT NULL,
  label text NOT NULL DEFAULT 'Sentar',
  icon text NOT NULL DEFAULT '💺',
  kind text NOT NULL DEFAULT 'sit',
  animation_key text NOT NULL DEFAULT 'sit',
  animation_url text,
  loop boolean NOT NULL DEFAULT true,
  offset_x double precision NOT NULL DEFAULT 0,
  offset_y double precision NOT NULL DEFAULT 0,
  offset_z double precision NOT NULL DEFAULT 0,
  rotation_y double precision NOT NULL DEFAULT 0,
  scale_mul double precision NOT NULL DEFAULT 1,
  trigger_radius double precision NOT NULL DEFAULT 1.5,
  exit_radius double precision NOT NULL DEFAULT 2.0,
  occupancy text NOT NULL DEFAULT 'multi',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_map_asset_interactions_map ON public.map_asset_interactions(map_id);
CREATE INDEX idx_map_asset_interactions_asset ON public.map_asset_interactions(asset_id);

ALTER TABLE public.map_asset_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interactions read all auth" ON public.map_asset_interactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "interactions admin insert" ON public.map_asset_interactions
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "interactions admin update" ON public.map_asset_interactions
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "interactions admin delete" ON public.map_asset_interactions
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_updated_at_map_asset_interactions
  BEFORE UPDATE ON public.map_asset_interactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.map_asset_interactions;