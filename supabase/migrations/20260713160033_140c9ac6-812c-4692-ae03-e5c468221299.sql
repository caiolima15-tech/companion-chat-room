-- Add animation pack + hand rig columns to weapons
ALTER TABLE public.weapons
  ADD COLUMN IF NOT EXISTS anim_pack text,             -- 'pistol' | 'rifle' | null
  ADD COLUMN IF NOT EXISTS hand_bone text DEFAULT 'mixamorigRightHand',
  ADD COLUMN IF NOT EXISTS hand_offset jsonb DEFAULT '{"px":0,"py":0,"pz":0,"rx":0,"ry":0,"rz":0,"scale":1}'::jsonb;
