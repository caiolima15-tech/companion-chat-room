-- Tabela characters
CREATE TABLE public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  base_url text,
  idle_url text,
  walk_url text,
  run_url text,
  jump_url text,
  dance_url text,
  wave_url text,
  thumbnail_url text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "characters read all auth"
  ON public.characters FOR SELECT TO authenticated USING (true);

CREATE POLICY "characters admin insert"
  ON public.characters FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "characters admin update"
  ON public.characters FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "characters admin delete"
  ON public.characters FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER characters_touch_updated_at
  BEFORE UPDATE ON public.characters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Coluna no profile pra guardar a escolha
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS character_slug text;

-- Bucket characters (público)
INSERT INTO storage.buckets (id, name, public)
VALUES ('characters', 'characters', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "characters public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'characters');

CREATE POLICY "characters admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'characters' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "characters admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'characters' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "characters admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'characters' AND public.has_role(auth.uid(), 'admin'));

-- Replicação realtime pra characters
ALTER PUBLICATION supabase_realtime ADD TABLE public.characters;