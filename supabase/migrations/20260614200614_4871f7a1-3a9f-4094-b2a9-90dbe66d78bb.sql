-- Job system tables
CREATE TABLE public.job_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id text NOT NULL,
  giver_npc_id uuid REFERENCES public.npc_instances(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text DEFAULT '',
  payout_cents integer NOT NULL DEFAULT 0,
  xp_reward integer NOT NULL DEFAULT 0,
  cooldown_seconds integer NOT NULL DEFAULT 0,
  min_level integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  start_step_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.job_templates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.job_templates TO authenticated;
GRANT ALL ON public.job_templates TO service_role;
ALTER TABLE public.job_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads active jobs" ON public.job_templates FOR SELECT USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin writes jobs" ON public.job_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.job_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.job_templates(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text DEFAULT '',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  dialogue jsonb NOT NULL DEFAULT '{}'::jsonb,
  position_x double precision DEFAULT 0,
  position_y double precision DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.job_steps TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.job_steps TO authenticated;
GRANT ALL ON public.job_steps TO service_role;
ALTER TABLE public.job_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read steps if job visible" ON public.job_steps FOR SELECT USING (true);
CREATE POLICY "admin writes steps" ON public.job_steps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.job_templates ADD CONSTRAINT job_templates_start_step_fk
  FOREIGN KEY (start_step_id) REFERENCES public.job_steps(id) ON DELETE SET NULL;

CREATE TABLE public.job_step_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_step_id uuid NOT NULL REFERENCES public.job_steps(id) ON DELETE CASCADE,
  to_step_id uuid NOT NULL REFERENCES public.job_steps(id) ON DELETE CASCADE,
  condition text NOT NULL DEFAULT 'on_success',
  order_idx integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.job_step_transitions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.job_step_transitions TO authenticated;
GRANT ALL ON public.job_step_transitions TO service_role;
ALTER TABLE public.job_step_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read transitions" ON public.job_step_transitions FOR SELECT USING (true);
CREATE POLICY "admin writes transitions" ON public.job_step_transitions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.job_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.job_templates(id) ON DELETE CASCADE,
  current_step_id uuid REFERENCES public.job_steps(id) ON DELETE SET NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_progress TO authenticated;
GRANT ALL ON public.job_progress TO service_role;
ALTER TABLE public.job_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own progress" ON public.job_progress FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.job_cooldowns (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.job_templates(id) ON DELETE CASCADE,
  available_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, job_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_cooldowns TO authenticated;
GRANT ALL ON public.job_cooldowns TO service_role;
ALTER TABLE public.job_cooldowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cooldown" ON public.job_cooldowns FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_job_steps_job ON public.job_steps(job_id);
CREATE INDEX idx_job_transitions_from ON public.job_step_transitions(from_step_id);
CREATE INDEX idx_job_progress_user ON public.job_progress(user_id, status);
CREATE INDEX idx_job_templates_map ON public.job_templates(map_id) WHERE active;

CREATE TRIGGER job_templates_updated BEFORE UPDATE ON public.job_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER job_progress_updated BEFORE UPDATE ON public.job_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RPC: complete a job (called when player reaches a 'complete' terminal step)
CREATE OR REPLACE FUNCTION public.complete_job(_progress_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prog public.job_progress;
  tpl public.job_templates;
BEGIN
  SELECT * INTO prog FROM public.job_progress WHERE id = _progress_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'progress not found'; END IF;
  IF prog.status <> 'active' THEN RAISE EXCEPTION 'not active'; END IF;

  SELECT * INTO tpl FROM public.job_templates WHERE id = prog.job_id;

  UPDATE public.job_progress
    SET status = 'completed', completed_at = now()
    WHERE id = prog.id;

  UPDATE public.profiles SET balance_cents = COALESCE(balance_cents,0) + tpl.payout_cents WHERE id = auth.uid();
  INSERT INTO public.wallet_transactions(user_id, amount_cents, reason, ref_id)
    VALUES (auth.uid(), tpl.payout_cents, 'job', tpl.id);

  IF tpl.cooldown_seconds > 0 THEN
    INSERT INTO public.job_cooldowns(user_id, job_id, available_at)
      VALUES (auth.uid(), tpl.id, now() + (tpl.cooldown_seconds || ' seconds')::interval)
      ON CONFLICT (user_id, job_id) DO UPDATE SET available_at = EXCLUDED.available_at;
  END IF;

  RETURN jsonb_build_object('ok', true, 'payout_cents', tpl.payout_cents, 'xp', tpl.xp_reward);
END;
$$;