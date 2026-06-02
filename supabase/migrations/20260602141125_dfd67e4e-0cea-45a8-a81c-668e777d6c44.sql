
-- ============ CARS CATALOG ============
CREATE TABLE public.cars_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  chassis_url text NOT NULL,
  wheel_url text,
  thumb text NOT NULL DEFAULT '🚗',
  -- defaults
  max_speed double precision NOT NULL DEFAULT 20,
  acceleration double precision NOT NULL DEFAULT 8,
  brake_force double precision NOT NULL DEFAULT 14,
  turn_speed double precision NOT NULL DEFAULT 2.2,
  wheel_radius double precision NOT NULL DEFAULT 0.35,
  chassis_scale double precision NOT NULL DEFAULT 1,
  chassis_offset_y double precision NOT NULL DEFAULT 0,
  -- wheel offsets {fl:{x,y,z}, fr:{x,y,z}, rl:{x,y,z}, rr:{x,y,z}}
  wheel_offsets jsonb NOT NULL DEFAULT '{"fl":{"x":-0.78,"y":0.1,"z":-1.25},"fr":{"x":0.75,"y":0.1,"z":-1.25},"rl":{"x":-0.78,"y":0.1,"z":1.25},"rr":{"x":0.75,"y":0.1,"z":1.25}}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cars_catalog TO authenticated;
GRANT ALL ON public.cars_catalog TO service_role;

ALTER TABLE public.cars_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cars_catalog read all auth" ON public.cars_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "cars_catalog admin insert" ON public.cars_catalog FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "cars_catalog admin update" ON public.cars_catalog FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "cars_catalog admin delete" ON public.cars_catalog FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

CREATE TRIGGER cars_catalog_touch BEFORE UPDATE ON public.cars_catalog FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ MAP CARS (instances) ============
CREATE TABLE public.map_cars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id text NOT NULL,
  catalog_id uuid REFERENCES public.cars_catalog(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT 'Carro',
  chassis_url text NOT NULL,
  wheel_url text,
  -- spawn / current placement (admin editable)
  x double precision NOT NULL DEFAULT 0,
  y double precision NOT NULL DEFAULT 0,
  z double precision NOT NULL DEFAULT 0,
  rotation_y double precision NOT NULL DEFAULT 0,
  -- per-instance tuning (overrides catalog)
  max_speed double precision NOT NULL DEFAULT 20,
  acceleration double precision NOT NULL DEFAULT 8,
  brake_force double precision NOT NULL DEFAULT 14,
  turn_speed double precision NOT NULL DEFAULT 2.2,
  wheel_radius double precision NOT NULL DEFAULT 0.35,
  chassis_scale double precision NOT NULL DEFAULT 1,
  chassis_offset_y double precision NOT NULL DEFAULT 0,
  wheel_offsets jsonb NOT NULL DEFAULT '{"fl":{"x":-0.78,"y":0.1,"z":-1.25},"fr":{"x":0.75,"y":0.1,"z":-1.25},"rl":{"x":-0.78,"y":0.1,"z":1.25},"rr":{"x":0.75,"y":0.1,"z":1.25}}'::jsonb,
  -- runtime
  driver_user_id uuid,
  driver_since timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX map_cars_map_id_idx ON public.map_cars(map_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_cars TO authenticated;
GRANT ALL ON public.map_cars TO service_role;

ALTER TABLE public.map_cars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "map_cars read all auth" ON public.map_cars FOR SELECT TO authenticated USING (true);
CREATE POLICY "map_cars admin insert" ON public.map_cars FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "map_cars admin delete" ON public.map_cars FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
-- admins can update everything; regular users can only update driver fields (to enter/exit a car)
CREATE POLICY "map_cars admin update" ON public.map_cars FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "map_cars driver claim" ON public.map_cars FOR UPDATE TO authenticated
  USING (driver_user_id IS NULL OR driver_user_id = auth.uid())
  WITH CHECK (driver_user_id IS NULL OR driver_user_id = auth.uid());

CREATE TRIGGER map_cars_touch BEFORE UPDATE ON public.map_cars FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.map_cars;
