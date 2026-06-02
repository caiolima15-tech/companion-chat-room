-- Limpa todo o histórico de mensagens
DELETE FROM public.chat_messages;
DELETE FROM public.direct_messages;

-- Função que apaga mensagens com mais de 12h, chamada via trigger em INSERT
CREATE OR REPLACE FUNCTION public.cleanup_old_chat_messages()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.chat_messages WHERE created_at < now() - interval '12 hours';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_cleanup_chat_messages ON public.chat_messages;
CREATE TRIGGER trg_cleanup_chat_messages
AFTER INSERT ON public.chat_messages
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_old_chat_messages();

-- Mesmo para DMs
CREATE OR REPLACE FUNCTION public.cleanup_old_direct_messages()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.direct_messages WHERE created_at < now() - interval '12 hours';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_cleanup_direct_messages ON public.direct_messages;
CREATE TRIGGER trg_cleanup_direct_messages
AFTER INSERT ON public.direct_messages
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_old_direct_messages();