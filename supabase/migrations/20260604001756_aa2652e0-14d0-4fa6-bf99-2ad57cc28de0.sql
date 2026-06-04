
-- Bot templates: reusable bot definitions (GLB + defaults) created from the bot panel
CREATE TABLE public.bot_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Bot',
  glb_url text NOT NULL,
  thumbnail_url text,
  default_scale double precision NOT NULL DEFAULT 1,
  default_animation_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_templates TO authenticated;
GRANT ALL ON public.bot_templates TO service_role;

ALTER TABLE public.bot_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bot_templates read all auth" ON public.bot_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "bot_templates admin insert" ON public.bot_templates FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "bot_templates admin update" ON public.bot_templates FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "bot_templates admin delete" ON public.bot_templates FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER bot_templates_touch BEFORE UPDATE ON public.bot_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_templates;

-- Extend map_bots: allow GLB-based bots independent from characters catalog
ALTER TABLE public.map_bots ALTER COLUMN character_slug DROP NOT NULL;
ALTER TABLE public.map_bots ADD COLUMN template_id uuid REFERENCES public.bot_templates(id) ON DELETE SET NULL;
ALTER TABLE public.map_bots ADD COLUMN glb_url text;
