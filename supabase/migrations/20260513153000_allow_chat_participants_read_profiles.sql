-- Allow chat participants to resolve each other's display name/avatar.
-- Without this, chat_messages can be visible while the sender profile is hidden
-- by the general hierarchy-scoped profiles policy, causing the UI to show
-- the fallback "Usuario".

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_chat_participants ON public.profiles;

CREATE POLICY profiles_select_chat_participants
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1
      FROM public.chat_messages cm
      WHERE cm.group_id IS NULL
        AND (
          (cm.sender_id = auth.uid() AND cm.receiver_id = profiles.id)
          OR (cm.receiver_id = auth.uid() AND cm.sender_id = profiles.id)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.chat_group_members me
      JOIN public.chat_group_members other
        ON other.group_id = me.group_id
      WHERE me.user_id = auth.uid()
        AND other.user_id = profiles.id
    )
  )
);
