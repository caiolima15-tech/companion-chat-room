
-- Weapons catalog (global)
CREATE TABLE public.weapons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'firearm',          -- 'melee' | 'firearm'
  wheel_slot smallint NOT NULL DEFAULT 1,        -- 0..7 (0 = fists/none)
  icon_url text,
  model_url text,                                -- GLB in player's hand (optional)
  hand text NOT NULL DEFAULT 'right',            -- attach bone
  damage integer NOT NULL DEFAULT 25,
  range_m double precision NOT NULL DEFAULT 40,
  fire_rate_ms integer NOT NULL DEFAULT 350,
  mag_size integer NOT NULL DEFAULT 12,
  reserve_start integer NOT NULL DEFAULT 60,
  reload_ms integer NOT NULL DEFAULT 1800,
  spread double precision NOT NULL DEFAULT 0.03,
  anim_shoot text DEFAULT 'wave',
  anim_reload text DEFAULT 'wave',
  anim_idle text DEFAULT 'idle',
  sfx_shoot uuid REFERENCES public.audio_clips(id) ON DELETE SET NULL,
  sfx_reload uuid REFERENCES public.audio_clips(id) ON DELETE SET NULL,
  sfx_empty uuid REFERENCES public.audio_clips(id) ON DELETE SET NULL,
  sfx_impact uuid REFERENCES public.audio_clips(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.weapons TO authenticated;
GRANT ALL ON public.weapons TO service_role;
ALTER TABLE public.weapons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weapons readable by authenticated" ON public.weapons FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage weapons" ON public.weapons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER weapons_updated_at BEFORE UPDATE ON public.weapons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Player inventory of weapons
CREATE TABLE public.player_weapons (
  user_id uuid NOT NULL,
  weapon_slug text NOT NULL,
  ammo_in_mag integer NOT NULL DEFAULT 0,
  ammo_reserve integer NOT NULL DEFAULT 0,
  equipped boolean NOT NULL DEFAULT false,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, weapon_slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_weapons TO authenticated;
GRANT ALL ON public.player_weapons TO service_role;
ALTER TABLE public.player_weapons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own player_weapons" ON public.player_weapons FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER player_weapons_updated_at BEFORE UPDATE ON public.player_weapons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Hostile flag + HP on NPC instances
ALTER TABLE public.npc_instances
  ADD COLUMN IF NOT EXISTS hostile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hp integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_hp integer NOT NULL DEFAULT 100;
