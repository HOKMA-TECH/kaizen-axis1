-- Hotfix: restore chat_messages visibility and send flow after RLS lockdown

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_messages'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.chat_messages', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY chat_messages_select_participants
ON public.chat_messages
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (sender_id = auth.uid() OR receiver_id = auth.uid())
);

CREATE POLICY chat_messages_insert_sender
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND sender_id = auth.uid()
  AND receiver_id IS NOT NULL
  AND conversation_id IS NOT NULL
);

CREATE POLICY chat_messages_update_participants
ON public.chat_messages
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (sender_id = auth.uid() OR receiver_id = auth.uid())
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (sender_id = auth.uid() OR receiver_id = auth.uid())
);

CREATE POLICY chat_messages_delete_participants
ON public.chat_messages
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (sender_id = auth.uid() OR receiver_id = auth.uid())
);
