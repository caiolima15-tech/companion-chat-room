
CREATE TABLE IF NOT EXISTS public.map_transforms (
  map_id text PRIMARY KEY,
  offset_x double precision NOT NULL DEFAULT 0,
  offset_y double precision NOT NULL DEFAULT 0,
  offset_z double precision NOT NULL DEFAULT 0,
  rotation_y double precision NOT NULL DEFAULT 0,
  scale_mul double precision NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.map_transforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "map_transforms read all auth"
ON public.map_transforms FOR SELECT TO authenticated USING (true);

CREATE POLICY "map_transforms admin insert"
ON public.map_transforms FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "map_transforms admin update"
ON public.map_transforms FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "map_transforms admin delete"
ON public.map_transforms FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.map_transforms;
