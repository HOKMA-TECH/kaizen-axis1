-- ============================================================
-- Ensure all chat features are accessible to every app role:
-- CORRETOR, COORDENADOR, GERENTE, DIRETOR, ADMIN
--
-- In Supabase/PostgreSQL, app-level roles (stored in profiles.role)
-- are NOT PostgreSQL roles — they are all mapped to the single
-- "authenticated" JWT role.  Granting to "authenticated" is therefore
-- the correct and complete way to allow access for all five roles.
-- ============================================================

-- ── View-once: open & wipe ───────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.chat_open_view_once(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_wipe_view_once_media()  TO authenticated;

-- ── Soft-delete (delete for me) ──────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.chat_delete_for_me(uuid)     TO authenticated;

-- ── Group helpers ────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.is_chat_group_member(uuid, uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_users_share_group(uuid, uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_group_creator(uuid)                TO authenticated;

-- ── Verify UPDATE policy is sender-scoped (idempotent re-create) ─────────────
DROP POLICY IF EXISTS chat_messages_update_sender_only ON public.chat_messages;

CREATE POLICY chat_messages_update_sender_only
ON public.chat_messages
FOR UPDATE
TO authenticated
USING  (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());

-- ── Verify INSERT policy allows all authenticated roles ───────────────────────
DROP POLICY IF EXISTS chat_messages_insert_sender ON public.chat_messages;

CREATE POLICY chat_messages_insert_sender
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND sender_id = auth.uid()
  AND conversation_id IS NOT NULL
  AND (
    (receiver_id IS NOT NULL AND group_id IS NULL)
    OR (receiver_id IS NULL AND group_id IS NOT NULL
        AND public.is_chat_group_member(group_id, auth.uid()))
  )
);

-- ── Verify SELECT policy allows all authenticated roles ───────────────────────
DROP POLICY IF EXISTS chat_messages_select_participants ON public.chat_messages;

CREATE POLICY chat_messages_select_participants
ON public.chat_messages
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    sender_id   = auth.uid()
    OR receiver_id = auth.uid()
    OR (group_id IS NOT NULL AND public.is_chat_group_member(group_id, auth.uid()))
  )
);
