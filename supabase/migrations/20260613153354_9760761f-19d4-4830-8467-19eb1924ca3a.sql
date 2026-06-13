-- 1. gender on npc_models
ALTER TABLE public.npc_models
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'neutral'
    CHECK (gender IN ('male','female','neutral'));

-- 2. npc_animations
CREATE TABLE IF NOT EXISTS public.npc_animations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  model_url text NOT NULL,
  gender text NOT NULL DEFAULT 'any' CHECK (gender IN ('male','female','any')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.npc_animations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.npc_animations TO authenticated;
GRANT ALL ON public.npc_animations TO service_role;
ALTER TABLE public.npc_animations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npc_anims read" ON public.npc_animations FOR SELECT USING (true);
CREATE POLICY "npc_anims admin write" ON public.npc_animations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "npc_anims admin update" ON public.npc_animations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "npc_anims admin delete" ON public.npc_animations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_npc_anims_upd BEFORE UPDATE ON public.npc_animations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. last_user_msg_at em npc_conversations
ALTER TABLE public.npc_conversations
  ADD COLUMN IF NOT EXISTS last_user_msg_at timestamptz NOT NULL DEFAULT now();