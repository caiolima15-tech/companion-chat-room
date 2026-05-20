INSERT INTO public.user_roles (user_id, role)
VALUES ('f4058f09-a8f0-4398-94c4-24ba3a420e19', 'admin'::public.app_role)
ON CONFLICT DO NOTHING;

DELETE FROM public.user_roles
WHERE user_id = 'f4058f09-a8f0-4398-94c4-24ba3a420e19' AND role = 'user';