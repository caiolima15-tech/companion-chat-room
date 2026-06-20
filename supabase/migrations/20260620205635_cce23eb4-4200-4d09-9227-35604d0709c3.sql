ALTER TABLE public.traffic_routes ALTER COLUMN map_id TYPE text USING map_id::text;
ALTER TABLE public.traffic_vehicles ALTER COLUMN map_id TYPE text USING map_id::text;