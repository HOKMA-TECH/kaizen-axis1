-- ============================================================
-- SECURITY HARDENING — Chat module
-- Fixes: C-01, C-02, C-03, A-03, A-07
-- ============================================================

-- ── C-01: Fix chat_delete_for_me — remove p_user_id, use auth.uid() ─────────
-- Drop old function with two parameters
DROP FUNCTION IF EXISTS public.chat_delete_for_me(uuid, uuid);

CREATE OR REPLACE FUNCTION public.chat_delete_for_me(p_message_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE chat_messages
  SET deleted_for = array_append(
    COALESCE(deleted_for, '{}'),
    auth.uid()
  )
  WHERE id = p_message_id
    AND (sender_id = auth.uid() OR receiver_id = auth.uid()
         OR (group_id IS NOT NULL AND is_chat_group_member(group_id, auth.uid())))
    AND NOT (auth.uid() = ANY(COALESCE(deleted_for, '{}')));
$$;

REVOKE ALL ON FUNCTION public.chat_delete_for_me(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_delete_for_me(uuid) TO authenticated;

-- ── C-02: Fix UPDATE policy — only sender may UPDATE directly ────────────────
-- Receivers use dedicated RPCs for their limited operations.

DROP POLICY IF EXISTS chat_messages_update_participants ON public.chat_messages;

CREATE POLICY chat_messages_update_sender_only
ON public.chat_messages
FOR UPDATE
TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());

-- ── C-02 + C-03: RPC for receiver to open a view-once message ───────────────
-- Only the intended receiver (or group member who didn't send) may open it.
-- Setting view_once_opened triggers the wipe trigger below.

CREATE OR REPLACE FUNCTION public.chat_open_view_once(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE chat_messages
  SET view_once_opened = true
  WHERE id = p_message_id
    AND view_once = true
    AND view_once_opened = false
    AND sender_id <> auth.uid()
    AND (
      receiver_id = auth.uid()
      OR (group_id IS NOT NULL AND is_chat_group_member(group_id, auth.uid()))
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found_or_unauthorized';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_open_view_once(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_open_view_once(uuid) TO authenticated;

-- ── C-03: Wipe media after view-once is opened ───────────────────────────────
-- Once view_once_opened flips to true, destroy the payload so the URL
-- is gone from the database even if someone queries directly via REST.

CREATE OR REPLACE FUNCTION public.chat_wipe_view_once_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.view_once = true AND NEW.view_once_opened = true
     AND (OLD.view_once_opened = false OR OLD.view_once_opened IS NULL) THEN
    NEW.media_url := NULL;
    NEW.content   := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wipe_view_once_media ON public.chat_messages;
CREATE TRIGGER trg_wipe_view_once_media
  BEFORE UPDATE OF view_once_opened ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_wipe_view_once_media();

-- ── A-03: Fix reactions SELECT — restrict to conversation participants ────────
DROP POLICY IF EXISTS "reactions_select" ON public.chat_message_reactions;

CREATE POLICY "reactions_select"
ON public.chat_message_reactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.chat_messages cm
    WHERE cm.id = message_id
      AND (
        cm.sender_id   = auth.uid()
        OR cm.receiver_id = auth.uid()
        OR (cm.group_id IS NOT NULL AND public.is_chat_group_member(cm.group_id, auth.uid()))
      )
  )
);

-- ── A-07: Fix wa_conversations — restrict entirely to service_role ────────────
DROP POLICY IF EXISTS "service_role full access" ON public.wa_conversations;

CREATE POLICY "service_role_only"
ON public.wa_conversations
TO service_role
USING (true)
WITH CHECK (true);
