CREATE TABLE public.animation_tunings (
  anim_key text PRIMARY KEY,
  off_x double precision NOT NULL DEFAULT 0,
  off_y double precision NOT NULL DEFAULT 0,
  off_z double precision NOT NULL DEFAULT 0,
  rot_x double precision NOT NULL DEFAULT 0,
  rot_y double precision NOT NULL DEFAULT 0,
  rot_z double precision NOT NULL DEFAULT 0,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.animation_tunings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.animation_tunings TO authenticated;
GRANT ALL ON public.animation_tunings TO service_role;

ALTER TABLE public.animation_tunings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "animation_tunings read all"
  ON public.animation_tunings FOR SELECT
  USING (true);

CREATE POLICY "animation_tunings admin insert"
  ON public.animation_tunings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "animation_tunings admin update"
  ON public.animation_tunings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "animation_tunings admin delete"
  ON public.animation_tunings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.animation_tunings;