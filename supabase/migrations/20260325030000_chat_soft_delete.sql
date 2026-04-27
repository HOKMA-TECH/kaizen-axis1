-- Soft delete para mensagens do chat — comportamento igual ao WhatsApp
--
-- deleted_for: array de UUIDs dos usuários que apagaram "para mim"
--   → filtrado no SELECT: usuário não vê mais a mensagem
--
-- is_deleted: marcador global "apagado para todos"
--   → a linha permanece no banco, mas o conteúdo é substituído por placeholder

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS deleted_for uuid[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_deleted  boolean   DEFAULT false;

-- Inicializa linhas existentes (evita NULLs no filtro .not.cs)
UPDATE public.chat_messages
  SET deleted_for = '{}'
  WHERE deleted_for IS NULL;

-- Índice GIN para buscas eficientes no array
CREATE INDEX IF NOT EXISTS idx_chat_messages_deleted_for
  ON public.chat_messages USING GIN (deleted_for);

-- Política UPDATE: remetente ou destinatário podem marcar mensagens como apagadas
DROP POLICY IF EXISTS "users_can_soft_delete_chat_messages" ON public.chat_messages;
CREATE POLICY "users_can_soft_delete_chat_messages"
  ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING  (auth.uid() = sender_id OR auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = sender_id OR auth.uid() = receiver_id);
