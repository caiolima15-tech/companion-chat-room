
CREATE TABLE public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL,
  to_user uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friend_requests_not_self CHECK (from_user <> to_user),
  CONSTRAINT friend_requests_unique_pair UNIQUE (from_user, to_user)
);

CREATE INDEX idx_friend_requests_from ON public.friend_requests(from_user);
CREATE INDEX idx_friend_requests_to ON public.friend_requests(to_user);
CREATE INDEX idx_friend_requests_status ON public.friend_requests(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_requests TO authenticated;
GRANT ALL ON public.friend_requests TO service_role;

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fr read own"
ON public.friend_requests FOR SELECT TO authenticated
USING (auth.uid() = from_user OR auth.uid() = to_user);

CREATE POLICY "fr insert own"
ON public.friend_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = from_user AND from_user <> to_user);

CREATE POLICY "fr update recipient or sender"
ON public.friend_requests FOR UPDATE TO authenticated
USING (auth.uid() = to_user OR auth.uid() = from_user);

CREATE POLICY "fr delete own"
ON public.friend_requests FOR DELETE TO authenticated
USING (auth.uid() = from_user OR auth.uid() = to_user);

CREATE TRIGGER trg_friend_requests_updated_at
BEFORE UPDATE ON public.friend_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
