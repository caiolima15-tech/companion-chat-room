
-- npc_instances.map_id and npc_routes.map_id need to be text (matching map_assets.map_id pattern like 'bar')
ALTER TABLE public.npc_instances DROP CONSTRAINT IF EXISTS npc_instances_route_id_fkey;
ALTER TABLE public.npc_routes ALTER COLUMN map_id DROP DEFAULT;
ALTER TABLE public.npc_routes ALTER COLUMN map_id TYPE text USING NULL;
ALTER TABLE public.npc_instances ALTER COLUMN map_id DROP DEFAULT;
ALTER TABLE public.npc_instances ALTER COLUMN map_id TYPE text USING NULL;
ALTER TABLE public.npc_instances ADD CONSTRAINT npc_instances_route_id_fkey
  FOREIGN KEY (route_id) REFERENCES public.npc_routes(id) ON DELETE SET NULL;

-- Schedule npc-tick to run every minute (each call runs ~50s of internal ticks)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'npc-tick-every-minute';
  IF job_id IS NOT NULL THEN PERFORM cron.unschedule(job_id); END IF;
END $$;

SELECT cron.schedule(
  'npc-tick-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ajphaszjpizepjmnjxtm.supabase.co/functions/v1/npc-tick',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqcGhhc3pqcGl6ZXBqbW5qeHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjYzOTksImV4cCI6MjA5NDgwMjM5OX0.uA5QN5snoDSOq0alFQMl89o_L4pksRIOWlZT0wm2nk0'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
