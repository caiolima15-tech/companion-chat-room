INSERT INTO public.characters (slug, name, base_url, position)
VALUES ('avatar-caio', 'Caio (teste GLB)', '/assets/characters/avatarcaio.glb', 100)
ON CONFLICT (slug) DO UPDATE SET
  base_url = EXCLUDED.base_url,
  name = EXCLUDED.name,
  idle_url = NULL,
  walk_url = NULL,
  run_url = NULL,
  jump_url = NULL,
  dance_url = NULL,
  wave_url = NULL;