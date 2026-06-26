-- 1) mechanics
CREATE TABLE public.mechanics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id text NOT NULL,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  trigger jsonb NOT NULL DEFAULT '{}'::jsonb,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  cooldown_seconds int NOT NULL DEFAULT 0,
  per_player boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mechanics TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.mechanics TO authenticated;
GRANT ALL ON public.mechanics TO service_role;
ALTER TABLE public.mechanics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mechanics readable" ON public.mechanics FOR SELECT USING (true);
CREATE POLICY "mechanics admin insert" ON public.mechanics FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "mechanics admin update" ON public.mechanics FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "mechanics admin delete" ON public.mechanics FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER mechanics_set_updated_at BEFORE UPDATE ON public.mechanics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.mechanics;

-- 2) player_state
CREATE TABLE public.player_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  map_id text NOT NULL DEFAULT '',
  key text NOT NULL,
  value jsonb,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, map_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_state TO authenticated;
GRANT ALL ON public.player_state TO service_role;
ALTER TABLE public.player_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "player_state self" ON public.player_state FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) mechanic_cooldowns
CREATE TABLE public.mechanic_cooldowns (
  mechanic_id uuid NOT NULL REFERENCES public.mechanics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  available_at timestamptz NOT NULL,
  PRIMARY KEY (mechanic_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mechanic_cooldowns TO authenticated;
GRANT ALL ON public.mechanic_cooldowns TO service_role;
ALTER TABLE public.mechanic_cooldowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cooldowns self" ON public.mechanic_cooldowns FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) job_templates.cover_url
ALTER TABLE public.job_templates ADD COLUMN IF NOT EXISTS cover_url text;
