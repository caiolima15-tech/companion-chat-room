CREATE TABLE public.map_thumbnails (
  map_id text PRIMARY KEY,
  thumb_url text NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.map_thumbnails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "map_thumbnails read all auth"
  ON public.map_thumbnails FOR SELECT TO authenticated USING (true);

CREATE POLICY "map_thumbnails admin insert"
  ON public.map_thumbnails FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "map_thumbnails admin update"
  ON public.map_thumbnails FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "map_thumbnails admin delete"
  ON public.map_thumbnails FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER map_thumbnails_touch
  BEFORE UPDATE ON public.map_thumbnails
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();