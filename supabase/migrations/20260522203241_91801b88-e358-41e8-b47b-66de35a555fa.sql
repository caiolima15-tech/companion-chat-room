
CREATE TABLE IF NOT EXISTS public.custom_maps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  url text NOT NULL,
  mood text NOT NULL DEFAULT 'day',
  bg text NOT NULL DEFAULT '#0e1117',
  thumb text NOT NULL DEFAULT '🗺️',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_maps read all auth" ON public.custom_maps
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "custom_maps admin insert" ON public.custom_maps
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "custom_maps admin update" ON public.custom_maps
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "custom_maps admin delete" ON public.custom_maps
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER custom_maps_touch BEFORE UPDATE ON public.custom_maps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_maps;

ALTER TABLE public.map_transforms ADD COLUMN IF NOT EXISTS mood text;
