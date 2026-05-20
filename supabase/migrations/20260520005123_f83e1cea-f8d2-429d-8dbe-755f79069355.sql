
-- Enum roles
create type public.app_role as enum ('admin', 'user');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Visitante',
  color text not null default '#29d3bd',
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles read all auth"
  on public.profiles for select to authenticated using (true);
create policy "profiles insert own"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles update own"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- Roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "roles read own or admin"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "roles admin manage"
  on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Map assets
create table public.map_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  x double precision not null default 0,
  z double precision not null default 0,
  rotation_y double precision not null default 0,
  scale double precision not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.map_assets enable row level security;

create policy "map_assets read all auth"
  on public.map_assets for select to authenticated using (true);
create policy "map_assets admin write"
  on public.map_assets for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));
create policy "map_assets admin update"
  on public.map_assets for update to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "map_assets admin delete"
  on public.map_assets for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger map_assets_touch before update on public.map_assets
  for each row execute function public.touch_updated_at();

-- Chat messages
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  color text not null default '#29d3bd',
  text text not null check (length(text) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table public.chat_messages enable row level security;

create policy "chat read all auth"
  on public.chat_messages for select to authenticated using (true);
create policy "chat insert own"
  on public.chat_messages for insert to authenticated with check (auth.uid() = user_id);

-- Auto-create profile + promote first user to admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  is_first boolean;
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', 'Visitante'))
  on conflict (id) do nothing;

  select count(*) = 0 into is_first from public.user_roles where role = 'admin';
  insert into public.user_roles (user_id, role)
  values (new.id, case when is_first then 'admin'::public.app_role else 'user'::public.app_role end);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Realtime
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.map_assets;
alter table public.map_assets replica identity full;
alter table public.chat_messages replica identity full;

-- Storage buckets
insert into storage.buckets (id, name, public) values ('avatars','avatars',true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('map-assets','map-assets',true) on conflict do nothing;

create policy "avatars public read"
  on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars own upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own update"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars own delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "map-assets public read"
  on storage.objects for select using (bucket_id = 'map-assets');
create policy "map-assets admin upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'map-assets' and public.has_role(auth.uid(), 'admin'));
create policy "map-assets admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'map-assets' and public.has_role(auth.uid(), 'admin'));
create policy "map-assets admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'map-assets' and public.has_role(auth.uid(), 'admin'));
