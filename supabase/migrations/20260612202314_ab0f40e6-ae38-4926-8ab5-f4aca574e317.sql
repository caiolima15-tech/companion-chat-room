DROP POLICY IF EXISTS "user_avatars insert own" ON public.user_avatars;
DROP POLICY IF EXISTS "user_avatars update own" ON public.user_avatars;
DROP POLICY IF EXISTS "user_avatars delete own" ON public.user_avatars;

CREATE POLICY "user_avatars admin insert"
  ON public.user_avatars FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_avatars admin update"
  ON public.user_avatars FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_avatars admin delete"
  ON public.user_avatars FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user avatar upload own folder" ON storage.objects;
DROP POLICY IF EXISTS "user avatar update own folder" ON storage.objects;
DROP POLICY IF EXISTS "user avatar delete own folder" ON storage.objects;