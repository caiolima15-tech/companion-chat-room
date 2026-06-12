
-- ========== NPC SYSTEM ==========

CREATE TABLE public.npc_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  model_url text NOT NULL,
  thumbnail_url text,
  default_persona jsonb NOT NULL DEFAULT '{"age":30,"occupation":"morador","mood":"casual","style":"informal"}'::jsonb,
  voice_id text NOT NULL DEFAULT 'JBFqnCBsd6RMkjVDRZzb',
  scale_mul double precision NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.npc_models TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.npc_models TO authenticated;
GRANT ALL ON public.npc_models TO service_role;
ALTER TABLE public.npc_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npc_models read" ON public.npc_models FOR SELECT USING (true);
CREATE POLICY "npc_models admin write" ON public.npc_models FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "npc_models admin update" ON public.npc_models FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "npc_models admin delete" ON public.npc_models FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_npc_models_upd BEFORE UPDATE ON public.npc_models FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.npc_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid,
  name text NOT NULL DEFAULT 'Rota',
  loop_back boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.npc_routes TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.npc_routes TO authenticated;
GRANT ALL ON public.npc_routes TO service_role;
ALTER TABLE public.npc_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npc_routes read" ON public.npc_routes FOR SELECT USING (true);
CREATE POLICY "npc_routes admin all" ON public.npc_routes FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.npc_waypoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.npc_routes(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL DEFAULT 0,
  z double precision NOT NULL,
  is_crosswalk boolean NOT NULL DEFAULT false,
  is_talk_spot boolean NOT NULL DEFAULT false,
  is_sit_spot boolean NOT NULL DEFAULT false,
  sit_template_id uuid,
  pause_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_npc_wp_route ON public.npc_waypoints(route_id, seq);
GRANT SELECT ON public.npc_waypoints TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.npc_waypoints TO authenticated;
GRANT ALL ON public.npc_waypoints TO service_role;
ALTER TABLE public.npc_waypoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npc_wp read" ON public.npc_waypoints FOR SELECT USING (true);
CREATE POLICY "npc_wp admin all" ON public.npc_waypoints FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.npc_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid,
  model_id uuid NOT NULL REFERENCES public.npc_models(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.npc_routes(id) ON DELETE SET NULL,
  display_name text NOT NULL DEFAULT 'NPC',
  persona jsonb NOT NULL DEFAULT '{}'::jsonb,
  voice_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.npc_instances TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.npc_instances TO authenticated;
GRANT ALL ON public.npc_instances TO service_role;
ALTER TABLE public.npc_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npc_inst read" ON public.npc_instances FOR SELECT USING (true);
CREATE POLICY "npc_inst admin all" ON public.npc_instances FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.npc_state (
  npc_id uuid PRIMARY KEY REFERENCES public.npc_instances(id) ON DELETE CASCADE,
  x double precision NOT NULL DEFAULT 0,
  y double precision NOT NULL DEFAULT 0,
  z double precision NOT NULL DEFAULT 0,
  rot_y double precision NOT NULL DEFAULT 0,
  anim text NOT NULL DEFAULT 'idle',
  status text NOT NULL DEFAULT 'walking',
  target_wp_seq integer NOT NULL DEFAULT 0,
  next_decision_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.npc_state REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.npc_state;
GRANT SELECT ON public.npc_state TO authenticated, anon;
GRANT ALL ON public.npc_state TO service_role;
ALTER TABLE public.npc_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npc_state read" ON public.npc_state FOR SELECT USING (true);

CREATE TABLE public.npc_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  npc_id uuid NOT NULL REFERENCES public.npc_instances(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_npc_conv ON public.npc_conversations(user_id, npc_id, created_at);
GRANT SELECT, INSERT ON public.npc_conversations TO authenticated;
GRANT ALL ON public.npc_conversations TO service_role;
ALTER TABLE public.npc_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npc_conv own read" ON public.npc_conversations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "npc_conv own insert" ON public.npc_conversations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ========== WALLET / DELIVERY SYSTEM ==========

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS balance_cents bigint NOT NULL DEFAULT 0;

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL,
  reason text NOT NULL,
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_user ON public.wallet_transactions(user_id, created_at DESC);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet own read" ON public.wallet_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.delivery_stats (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  deliveries_completed integer NOT NULL DEFAULT 0,
  best_time_ms integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delivery_stats TO authenticated;
GRANT ALL ON public.delivery_stats TO service_role;
ALTER TABLE public.delivery_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stats own read" ON public.delivery_stats FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "stats all read" ON public.delivery_stats FOR SELECT TO authenticated USING (true);

CREATE TABLE public.delivery_hubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid,
  name text NOT NULL DEFAULT 'Posto de Entrega',
  pickup_x double precision NOT NULL,
  pickup_y double precision NOT NULL DEFAULT 0,
  pickup_z double precision NOT NULL,
  base_pay_cents integer NOT NULL DEFAULT 500,
  bonus_pay_cents integer NOT NULL DEFAULT 1500,
  min_level integer NOT NULL DEFAULT 1,
  pay_per_km_cents integer NOT NULL DEFAULT 200,
  time_per_100m_ms integer NOT NULL DEFAULT 8000,
  base_time_ms integer NOT NULL DEFAULT 90000,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delivery_hubs TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.delivery_hubs TO authenticated;
GRANT ALL ON public.delivery_hubs TO service_role;
ALTER TABLE public.delivery_hubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hubs read" ON public.delivery_hubs FOR SELECT USING (true);
CREATE POLICY "hubs admin all" ON public.delivery_hubs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.delivery_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id uuid NOT NULL REFERENCES public.delivery_hubs(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Endereço',
  x double precision NOT NULL,
  y double precision NOT NULL DEFAULT 0,
  z double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dd_hub ON public.delivery_destinations(hub_id);
GRANT SELECT ON public.delivery_destinations TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.delivery_destinations TO authenticated;
GRANT ALL ON public.delivery_destinations TO service_role;
ALTER TABLE public.delivery_destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd read" ON public.delivery_destinations FOR SELECT USING (true);
CREATE POLICY "dd admin all" ON public.delivery_destinations FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hub_id uuid NOT NULL REFERENCES public.delivery_hubs(id) ON DELETE CASCADE,
  destination_id uuid NOT NULL REFERENCES public.delivery_destinations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','failed','abandoned')),
  time_limit_ms integer NOT NULL,
  distance_m double precision NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  payout_cents integer,
  xp_gained integer
);
CREATE INDEX idx_dj_user ON public.delivery_jobs(user_id, status);
GRANT SELECT, INSERT, UPDATE ON public.delivery_jobs TO authenticated;
GRANT ALL ON public.delivery_jobs TO service_role;
ALTER TABLE public.delivery_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dj own read" ON public.delivery_jobs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "dj own insert" ON public.delivery_jobs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "dj own update" ON public.delivery_jobs FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ========== complete_delivery RPC (SECURITY DEFINER) ==========
CREATE OR REPLACE FUNCTION public.complete_delivery(_job_id uuid, _player_x double precision, _player_z double precision)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.delivery_jobs;
  hub public.delivery_hubs;
  dest public.delivery_destinations;
  elapsed_ms integer;
  speed_factor double precision;
  payout integer;
  xp_gain integer;
  dist_to_dest double precision;
  cur_stats public.delivery_stats;
  new_level integer;
BEGIN
  SELECT * INTO j FROM public.delivery_jobs WHERE id = _job_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'job not found'; END IF;
  IF j.status <> 'active' THEN RAISE EXCEPTION 'job not active'; END IF;

  SELECT * INTO hub FROM public.delivery_hubs WHERE id = j.hub_id;
  SELECT * INTO dest FROM public.delivery_destinations WHERE id = j.destination_id;

  dist_to_dest := sqrt(power(_player_x - dest.x, 2) + power(_player_z - dest.z, 2));
  IF dist_to_dest > 6 THEN RAISE EXCEPTION 'too far from destination'; END IF;

  elapsed_ms := GREATEST(1, EXTRACT(EPOCH FROM (now() - j.started_at)) * 1000)::integer;
  speed_factor := GREATEST(0, (j.time_limit_ms - elapsed_ms)::double precision / j.time_limit_ms);

  IF elapsed_ms > j.time_limit_ms THEN
    payout := (hub.base_pay_cents * 0.3)::integer;
    xp_gain := 0;
  ELSE
    payout := hub.base_pay_cents + (hub.bonus_pay_cents * speed_factor)::integer + (j.distance_m / 1000 * hub.pay_per_km_cents)::integer;
    xp_gain := 20 + (speed_factor * 30)::integer + (j.distance_m / 100)::integer;
  END IF;

  UPDATE public.delivery_jobs
    SET status = CASE WHEN elapsed_ms > j.time_limit_ms THEN 'failed' ELSE 'completed' END,
        completed_at = now(), payout_cents = payout, xp_gained = xp_gain
    WHERE id = j.id;

  UPDATE public.profiles SET balance_cents = balance_cents + payout WHERE id = auth.uid();
  INSERT INTO public.wallet_transactions(user_id, amount_cents, reason, ref_id)
    VALUES (auth.uid(), payout, 'delivery', j.id);

  INSERT INTO public.delivery_stats(user_id, xp, deliveries_completed, best_time_ms)
    VALUES (auth.uid(), xp_gain, 1, elapsed_ms)
    ON CONFLICT (user_id) DO UPDATE
      SET xp = public.delivery_stats.xp + xp_gain,
          deliveries_completed = public.delivery_stats.deliveries_completed + 1,
          best_time_ms = LEAST(COALESCE(public.delivery_stats.best_time_ms, 999999999), elapsed_ms),
          updated_at = now();

  SELECT * INTO cur_stats FROM public.delivery_stats WHERE user_id = auth.uid();
  new_level := 1 + FLOOR(sqrt(cur_stats.xp::double precision / 100));
  IF new_level <> cur_stats.level THEN
    UPDATE public.delivery_stats SET level = new_level WHERE user_id = auth.uid();
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'payout_cents', payout,
    'xp_gained', xp_gain,
    'elapsed_ms', elapsed_ms,
    'on_time', elapsed_ms <= j.time_limit_ms,
    'level', new_level
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid, double precision, double precision) TO authenticated;

-- Auto-purge old NPC conversations
CREATE OR REPLACE FUNCTION public.cleanup_old_npc_conversations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.npc_conversations WHERE created_at < now() - interval '24 hours';
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_cleanup_npc_conv AFTER INSERT ON public.npc_conversations
  FOR EACH STATEMENT EXECUTE FUNCTION public.cleanup_old_npc_conversations();
