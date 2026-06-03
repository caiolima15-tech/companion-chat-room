
-- item_catalog
CREATE TABLE public.item_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  glb_url text NOT NULL,
  scale double precision NOT NULL DEFAULT 1,
  spawn_offset_y double precision NOT NULL DEFAULT 0,
  hold_bone text NOT NULL DEFAULT 'RightHand',
  hold_offset_x double precision NOT NULL DEFAULT 0,
  hold_offset_y double precision NOT NULL DEFAULT 0,
  hold_offset_z double precision NOT NULL DEFAULT 0,
  hold_rot_x double precision NOT NULL DEFAULT 0,
  hold_rot_y double precision NOT NULL DEFAULT 0,
  hold_rot_z double precision NOT NULL DEFAULT 0,
  hold_scale double precision NOT NULL DEFAULT 1,
  drink_animation_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.item_catalog TO authenticated;
GRANT ALL ON public.item_catalog TO service_role;

ALTER TABLE public.item_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_catalog read all auth" ON public.item_catalog
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "item_catalog admin insert" ON public.item_catalog
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "item_catalog admin update" ON public.item_catalog
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "item_catalog admin delete" ON public.item_catalog
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER item_catalog_touch BEFORE UPDATE ON public.item_catalog
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- map_item_instances
CREATE TABLE public.map_item_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id text NOT NULL,
  item_slug text NOT NULL,
  x double precision NOT NULL DEFAULT 0,
  y double precision NOT NULL DEFAULT 0,
  z double precision NOT NULL DEFAULT 0,
  rotation_y double precision NOT NULL DEFAULT 0,
  spawned_by uuid,
  source_interaction_id uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX map_item_instances_map_idx ON public.map_item_instances(map_id);
CREATE INDEX map_item_instances_expires_idx ON public.map_item_instances(expires_at);

GRANT SELECT, INSERT, DELETE ON public.map_item_instances TO authenticated;
GRANT ALL ON public.map_item_instances TO service_role;

ALTER TABLE public.map_item_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "map_item_instances read all auth" ON public.map_item_instances
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_item_instances insert auth" ON public.map_item_instances
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "map_item_instances delete auth" ON public.map_item_instances
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.item_catalog;
ALTER PUBLICATION supabase_realtime ADD TABLE public.map_item_instances;

-- Estende map_asset_interactions para suporte a garçom
ALTER TABLE public.map_asset_interactions
  ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.map_bots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bot_animation_url text,
  ADD COLUMN IF NOT EXISTS item_slug text,
  ADD COLUMN IF NOT EXISTS item_spawn_offset_x double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_spawn_offset_y double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_spawn_offset_z double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_duration_ms integer NOT NULL DEFAULT 3500,
  ADD COLUMN IF NOT EXISTS auto_despawn_ms integer NOT NULL DEFAULT 60000;
