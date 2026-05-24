
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS avatar_url text;

CREATE TABLE IF NOT EXISTS public.profile_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "photos read all auth" ON public.profile_photos;
CREATE POLICY "photos read all auth" ON public.profile_photos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "photos insert own" ON public.profile_photos;
CREATE POLICY "photos insert own" ON public.profile_photos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "photos delete own" ON public.profile_photos;
CREATE POLICY "photos delete own" ON public.profile_photos FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "photos update own" ON public.profile_photos;
CREATE POLICY "photos update own" ON public.profile_photos FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follows read all auth" ON public.follows;
CREATE POLICY "follows read all auth" ON public.follows FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "follows insert own" ON public.follows;
CREATE POLICY "follows insert own" ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
DROP POLICY IF EXISTS "follows delete own" ON public.follows;
CREATE POLICY "follows delete own" ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL,
  to_user uuid NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS direct_messages_pair_idx ON public.direct_messages (from_user, to_user, created_at);
CREATE INDEX IF NOT EXISTS direct_messages_to_idx ON public.direct_messages (to_user, created_at);
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dm read own" ON public.direct_messages;
CREATE POLICY "dm read own" ON public.direct_messages FOR SELECT TO authenticated USING (auth.uid() = from_user OR auth.uid() = to_user);
DROP POLICY IF EXISTS "dm insert own" ON public.direct_messages;
CREATE POLICY "dm insert own" ON public.direct_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_user AND from_user <> to_user);
DROP POLICY IF EXISTS "dm update recipient" ON public.direct_messages;
CREATE POLICY "dm update recipient" ON public.direct_messages FOR UPDATE TO authenticated USING (auth.uid() = to_user);

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='direct_messages';
  IF NOT FOUND THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages'; END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='follows';
  IF NOT FOUND THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.follows'; END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='profile_photos';
  IF NOT FOUND THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profile_photos'; END IF;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "profile-photos public read" ON storage.objects;
CREATE POLICY "profile-photos public read" ON storage.objects FOR SELECT USING (bucket_id = 'profile-photos');
DROP POLICY IF EXISTS "profile-photos own upload" ON storage.objects;
CREATE POLICY "profile-photos own upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "profile-photos own delete" ON storage.objects;
CREATE POLICY "profile-photos own delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "profile-photos own update" ON storage.objects;
CREATE POLICY "profile-photos own update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
