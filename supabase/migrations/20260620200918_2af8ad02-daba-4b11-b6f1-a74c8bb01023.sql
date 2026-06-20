
CREATE TABLE IF NOT EXISTS public.game_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_settings TO authenticated;
GRANT ALL ON public.game_settings TO service_role;
ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_settings read all auth" ON public.game_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "game_settings admin insert" ON public.game_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "game_settings admin update" ON public.game_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "game_settings admin delete" ON public.game_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER game_settings_touch BEFORE UPDATE ON public.game_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_settings;
INSERT INTO public.game_settings(key,value) VALUES ('npc_load_radius','25'::jsonb) ON CONFLICT (key) DO NOTHING;
