
-- Traffic routes
CREATE TABLE public.traffic_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Rota',
  direction text NOT NULL DEFAULT 'forward',
  lane_offset double precision NOT NULL DEFAULT 0,
  loop boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT ON public.traffic_routes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.traffic_routes TO authenticated;
GRANT ALL ON public.traffic_routes TO service_role;
ALTER TABLE public.traffic_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trf_routes_select" ON public.traffic_routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "trf_routes_admin_ins" ON public.traffic_routes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "trf_routes_admin_upd" ON public.traffic_routes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "trf_routes_admin_del" ON public.traffic_routes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Waypoints
CREATE TABLE public.traffic_waypoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.traffic_routes(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL DEFAULT 0,
  z double precision NOT NULL,
  speed_mps double precision NOT NULL DEFAULT 8,
  is_stop boolean NOT NULL DEFAULT false,
  stop_duration_ms integer NOT NULL DEFAULT 3000,
  is_yield boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trf_wp_route_seq ON public.traffic_waypoints(route_id, seq);
GRANT SELECT ON public.traffic_waypoints TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.traffic_waypoints TO authenticated;
GRANT ALL ON public.traffic_waypoints TO service_role;
ALTER TABLE public.traffic_waypoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trf_wp_select" ON public.traffic_waypoints FOR SELECT TO authenticated USING (true);
CREATE POLICY "trf_wp_admin_ins" ON public.traffic_waypoints FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "trf_wp_admin_upd" ON public.traffic_waypoints FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "trf_wp_admin_del" ON public.traffic_waypoints FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Signals
CREATE TABLE public.traffic_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waypoint_id uuid NOT NULL REFERENCES public.traffic_waypoints(id) ON DELETE CASCADE,
  cycle_red_ms integer NOT NULL DEFAULT 8000,
  cycle_green_ms integer NOT NULL DEFAULT 10000,
  cycle_yellow_ms integer NOT NULL DEFAULT 2000,
  phase_offset_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.traffic_signals TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.traffic_signals TO authenticated;
GRANT ALL ON public.traffic_signals TO service_role;
ALTER TABLE public.traffic_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trf_sig_select" ON public.traffic_signals FOR SELECT TO authenticated USING (true);
CREATE POLICY "trf_sig_admin_ins" ON public.traffic_signals FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "trf_sig_admin_upd" ON public.traffic_signals FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "trf_sig_admin_del" ON public.traffic_signals FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Vehicles
CREATE TABLE public.traffic_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL,
  route_id uuid NOT NULL REFERENCES public.traffic_routes(id) ON DELETE CASCADE,
  car_catalog_id uuid REFERENCES public.cars_catalog(id) ON DELETE SET NULL,
  color_hex text,
  max_speed_mps double precision NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.traffic_vehicles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.traffic_vehicles TO authenticated;
GRANT ALL ON public.traffic_vehicles TO service_role;
ALTER TABLE public.traffic_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trf_veh_select" ON public.traffic_vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "trf_veh_admin_ins" ON public.traffic_vehicles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "trf_veh_admin_upd" ON public.traffic_vehicles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "trf_veh_admin_del" ON public.traffic_vehicles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- State
CREATE TABLE public.traffic_state (
  vehicle_id uuid PRIMARY KEY REFERENCES public.traffic_vehicles(id) ON DELETE CASCADE,
  x double precision NOT NULL DEFAULT 0,
  y double precision NOT NULL DEFAULT 0,
  z double precision NOT NULL DEFAULT 0,
  rot_y double precision NOT NULL DEFAULT 0,
  speed double precision NOT NULL DEFAULT 0,
  segment_index integer NOT NULL DEFAULT 0,
  t double precision NOT NULL DEFAULT 0,
  stopped_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.traffic_state TO authenticated;
GRANT ALL ON public.traffic_state TO service_role;
ALTER TABLE public.traffic_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trf_state_select" ON public.traffic_state FOR SELECT TO authenticated USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.traffic_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.traffic_vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.traffic_routes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.traffic_waypoints;

-- Game settings defaults
INSERT INTO public.game_settings(key, value) VALUES
  ('traffic_load_radius', '60'::jsonb),
  ('traffic_hearing_radius', '30'::jsonb),
  ('traffic_min_gap_m', '6'::jsonb)
ON CONFLICT (key) DO NOTHING;
