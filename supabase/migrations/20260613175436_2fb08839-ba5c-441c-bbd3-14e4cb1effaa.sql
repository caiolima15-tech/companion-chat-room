DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.npc_instances; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.npc_models; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.npc_animations; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.npc_routes; EXCEPTION WHEN duplicate_object THEN END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.npc_waypoints; EXCEPTION WHEN duplicate_object THEN END;
END $$;
ALTER TABLE public.npc_instances REPLICA IDENTITY FULL;
ALTER TABLE public.npc_models REPLICA IDENTITY FULL;
ALTER TABLE public.npc_animations REPLICA IDENTITY FULL;
ALTER TABLE public.npc_routes REPLICA IDENTITY FULL;
ALTER TABLE public.npc_waypoints REPLICA IDENTITY FULL;