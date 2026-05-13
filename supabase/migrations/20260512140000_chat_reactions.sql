-- Reações a mensagens do chat (estilo WhatsApp)
CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)   -- um usuário = uma reação por mensagem
);

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

-- Qualquer participante pode ver reações
CREATE POLICY "reactions_select"
ON public.chat_message_reactions FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- Usuário reage com seu próprio user_id
CREATE POLICY "reactions_insert"
ON public.chat_message_reactions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Usuário só apaga a própria reação
CREATE POLICY "reactions_delete"
ON public.chat_message_reactions FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Usuário pode trocar o emoji (upsert usa UPDATE)
CREATE POLICY "reactions_update"
ON public.chat_message_reactions FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message_id
  ON public.chat_message_reactions(message_id);
