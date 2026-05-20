ALTER TABLE public.user_avatars REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_avatars;