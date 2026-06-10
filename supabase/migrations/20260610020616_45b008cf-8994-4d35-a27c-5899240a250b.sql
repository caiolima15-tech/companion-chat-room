
CREATE TABLE public.interaction_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  label text NOT NULL DEFAULT 'Sentar',
  icon text NOT NULL DEFAULT '💺',
  kind text NOT NULL DEFAULT 'sit',
  animation_key text NOT NULL DEFAULT 'sit',
  animation_url text,
  loop boolean NOT NULL DEFAULT true,
  offset_x double precision NOT NULL DEFAULT 0,
  offset_y double precision NOT NULL DEFAULT 0,
  offset_z double precision NOT NULL DEFAULT 0,
  rotation_x double precision NOT NULL DEFAULT 0,
  rotation_y double precision NOT NULL DEFAULT 0,
  rotation_z double precision NOT NULL DEFAULT 0,
  scale_mul double precision NOT NULL DEFAULT 1,
  trigger_radius double precision NOT NULL DEFAULT 1.5,
  exit_radius double precision NOT NULL DEFAULT 2.0,
  occupancy text NOT NULL DEFAULT 'multi',
  bot_animation_url text,
  item_slug text,
  item_spawn_offset_x double precision NOT NULL DEFAULT 0,
  item_spawn_offset_y double precision NOT NULL DEFAULT 0,
  item_spawn_offset_z double precision NOT NULL DEFAULT 0,
  service_duration_ms integer NOT NULL DEFAULT 3500,
  auto_despawn_ms integer NOT NULL DEFAULT 60000,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interaction_templates TO authenticated;
GRANT ALL ON public.interaction_templates TO service_role;

ALTER TABLE public.interaction_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates read all auth" ON public.interaction_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "templates admin insert" ON public.interaction_templates
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "templates admin update" ON public.interaction_templates
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "templates admin delete" ON public.interaction_templates
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER set_updated_at_interaction_templates
  BEFORE UPDATE ON public.interaction_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
