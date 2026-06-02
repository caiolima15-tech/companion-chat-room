REVOKE EXECUTE ON FUNCTION public.cleanup_old_chat_messages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_direct_messages() FROM PUBLIC, anon, authenticated;