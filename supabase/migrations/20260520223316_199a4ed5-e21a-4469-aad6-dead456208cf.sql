ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS map_id text NOT NULL DEFAULT 'bar';

CREATE INDEX IF NOT EXISTS chat_messages_map_created_idx
  ON public.chat_messages (map_id, created_at DESC);