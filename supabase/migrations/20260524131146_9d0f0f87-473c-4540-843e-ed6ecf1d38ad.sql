
CREATE TABLE public.map_radios (
  map_id text PRIMARY KEY,
  station_name text NOT NULL DEFAULT '',
  genre text NOT NULL DEFAULT '',
  stream_url text NOT NULL DEFAULT '',
  is_playing boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.map_radios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "map_radios read all auth"
  ON public.map_radios FOR SELECT TO authenticated USING (true);

CREATE POLICY "map_radios admin insert"
  ON public.map_radios FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "map_radios admin update"
  ON public.map_radios FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "map_radios admin delete"
  ON public.map_radios FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_map_radios_updated_at
  BEFORE UPDATE ON public.map_radios
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.map_radios;
ALTER TABLE public.map_radios REPLICA IDENTITY FULL;
