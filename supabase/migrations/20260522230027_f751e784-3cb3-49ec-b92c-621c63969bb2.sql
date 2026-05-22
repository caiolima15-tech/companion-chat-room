
create table public.bot_animations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.bot_animations enable row level security;
create policy "bot_animations read all auth" on public.bot_animations for select to authenticated using (true);
create policy "bot_animations admin insert" on public.bot_animations for insert to authenticated with check (has_role(auth.uid(),'admin'));
create policy "bot_animations admin update" on public.bot_animations for update to authenticated using (has_role(auth.uid(),'admin'));
create policy "bot_animations admin delete" on public.bot_animations for delete to authenticated using (has_role(auth.uid(),'admin'));

create table public.map_bots (
  id uuid primary key default gen_random_uuid(),
  map_id text not null,
  name text not null default 'Bot',
  character_slug text not null,
  animation_url text,
  x double precision not null default 0,
  y double precision not null default 0,
  z double precision not null default 0,
  rotation_y double precision not null default 0,
  scale double precision not null default 1,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index map_bots_map_idx on public.map_bots(map_id);
alter table public.map_bots enable row level security;
create policy "map_bots read all auth" on public.map_bots for select to authenticated using (true);
create policy "map_bots admin insert" on public.map_bots for insert to authenticated with check (has_role(auth.uid(),'admin'));
create policy "map_bots admin update" on public.map_bots for update to authenticated using (has_role(auth.uid(),'admin'));
create policy "map_bots admin delete" on public.map_bots for delete to authenticated using (has_role(auth.uid(),'admin'));

create trigger map_bots_touch before update on public.map_bots
  for each row execute function public.touch_updated_at();

alter publication supabase_realtime add table public.map_bots;
alter publication supabase_realtime add table public.bot_animations;
