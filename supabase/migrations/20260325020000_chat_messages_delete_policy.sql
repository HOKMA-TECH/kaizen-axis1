-- Permite que usuários autenticados apaguem mensagens das suas conversas
-- (mensagens onde são remetente OU destinatário)
--
-- Isso habilita tanto:
--   • Apagar mensagem individual (dentro da conversa)
--   • Apagar conversa inteira (remove todas as mensagens do conversation_id)

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_can_delete_chat_messages" ON public.chat_messages;

CREATE POLICY "users_can_delete_chat_messages"
  ON public.chat_messages
  FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
