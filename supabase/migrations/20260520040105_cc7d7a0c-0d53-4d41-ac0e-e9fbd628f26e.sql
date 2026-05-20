CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  is_first boolean;
  is_owner_email boolean;
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', 'Visitante'))
  on conflict (id) do nothing;

  select count(*) = 0 into is_first from public.user_roles where role = 'admin';
  is_owner_email := lower(coalesce(new.email, '')) = 'caiovictorlima50@gmail.com';

  insert into public.user_roles (user_id, role)
  values (
    new.id,
    case when is_first or is_owner_email then 'admin'::public.app_role else 'user'::public.app_role end
  )
  on conflict do nothing;
  return new;
end $function$;