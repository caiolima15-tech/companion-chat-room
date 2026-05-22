CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.map_lights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'spot',
  name TEXT NOT NULL DEFAULT 'Luz',
  enabled BOOLEAN NOT NULL DEFAULT true,
  color TEXT NOT NULL DEFAULT '#ffffff',
  intensity DOUBLE PRECISION NOT NULL DEFAULT 5,
  pos_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  pos_y DOUBLE PRECISION NOT NULL DEFAULT 6,
  pos_z DOUBLE PRECISION NOT NULL DEFAULT 0,
  target_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  target_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  target_z DOUBLE PRECISION NOT NULL DEFAULT 0,
  angle_deg DOUBLE PRECISION NOT NULL DEFAULT 35,
  penumbra DOUBLE PRECISION NOT NULL DEFAULT 0.4,
  distance DOUBLE PRECISION NOT NULL DEFAULT 30,
  radius DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  cast_shadow BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_map_lights_map_id ON public.map_lights(map_id);
ALTER TABLE public.map_lights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "map_lights read all auth" ON public.map_lights FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_lights admin insert" ON public.map_lights FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "map_lights admin update" ON public.map_lights FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "map_lights admin delete" ON public.map_lights FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_map_lights_updated BEFORE UPDATE ON public.map_lights
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.map_transforms ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN NOT NULL DEFAULT false;
ALTER PUBLICATION supabase_realtime ADD TABLE public.map_lights;