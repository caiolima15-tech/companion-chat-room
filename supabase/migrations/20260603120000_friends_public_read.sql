-- Allow any authenticated user to see accepted friendships so they can be displayed on public profiles.
CREATE POLICY "fr read accepted public"
ON public.friend_requests
FOR SELECT
TO authenticated
USING (status = 'accepted');
