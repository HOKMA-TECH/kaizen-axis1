-- Add group_id to chat_messages for group messaging
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.chat_groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_group_id ON public.chat_messages(group_id);

-- Recreate policies to support group messages
DROP POLICY IF EXISTS chat_messages_select_participants ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_insert_sender ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_update_participants ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_delete_participants ON public.chat_messages;

CREATE POLICY chat_messages_select_participants
ON public.chat_messages FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR (group_id IS NOT NULL AND public.is_chat_group_member(group_id))
  )
);

CREATE POLICY chat_messages_insert_sender
ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND sender_id = auth.uid()
  AND conversation_id IS NOT NULL
  AND (
    (receiver_id IS NOT NULL AND group_id IS NULL)
    OR (receiver_id IS NULL AND group_id IS NOT NULL AND public.is_chat_group_member(group_id))
  )
);

CREATE POLICY chat_messages_update_participants
ON public.chat_messages FOR UPDATE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR (group_id IS NOT NULL AND public.is_chat_group_member(group_id))
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR (group_id IS NOT NULL AND public.is_chat_group_member(group_id))
  )
);

CREATE POLICY chat_messages_delete_participants
ON public.chat_messages FOR DELETE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR (group_id IS NOT NULL AND public.is_chat_group_member(group_id))
  )
);
