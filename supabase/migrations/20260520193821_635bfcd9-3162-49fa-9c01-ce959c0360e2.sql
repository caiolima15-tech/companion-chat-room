-- user_avatars table
create table public.user_avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null default 'Meu Avatar',
  base_url text not null,
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_avatars enable row level security;

create policy "user_avatars read all auth"
  on public.user_avatars for select
  to authenticated
  using (true);

create policy "user_avatars insert own"
  on public.user_avatars for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "user_avatars update own"
  on public.user_avatars for update
  to authenticated
  using (auth.uid() = user_id);

create policy "user_avatars delete own"
  on public.user_avatars for delete
  to authenticated
  using (auth.uid() = user_id);

create trigger user_avatars_touch_updated
  before update on public.user_avatars
  for each row execute function public.touch_updated_at();

create index user_avatars_user_idx on public.user_avatars(user_id, created_at desc);

-- Storage policies: usuários podem subir/atualizar/deletar arquivos
-- somente dentro de characters/user-avatars/<auth.uid()>/
create policy "user avatar upload own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'characters'
    and (storage.foldername(name))[1] = 'user-avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "user avatar update own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'characters'
    and (storage.foldername(name))[1] = 'user-avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "user avatar delete own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'characters'
    and (storage.foldername(name))[1] = 'user-avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
