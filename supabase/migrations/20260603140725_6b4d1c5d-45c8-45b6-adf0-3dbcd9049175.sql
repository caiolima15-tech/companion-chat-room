
CREATE TABLE public.map_portals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id TEXT NOT NULL,
  dest_map_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Portal',
  pos_x NUMERIC NOT NULL DEFAULT 0,
  pos_y NUMERIC NOT NULL DEFAULT 0,
  pos_z NUMERIC NOT NULL DEFAULT 0,
  radius NUMERIC NOT NULL DEFAULT 1.2,
  height NUMERIC NOT NULL DEFAULT 2.6,
  color TEXT NOT NULL DEFAULT '#ff3ea5',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.map_portals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_portals TO authenticated;
GRANT ALL ON public.map_portals TO service_role;

CREATE INDEX idx_map_portals_map_id ON public.map_portals(map_id);

ALTER TABLE public.map_portals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portals are viewable by everyone"
  ON public.map_portals FOR SELECT USING (true);

CREATE POLICY "Admins can insert portals"
  ON public.map_portals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update portals"
  ON public.map_portals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete portals"
  ON public.map_portals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_map_portals_updated_at
  BEFORE UPDATE ON public.map_portals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.map_portals;
