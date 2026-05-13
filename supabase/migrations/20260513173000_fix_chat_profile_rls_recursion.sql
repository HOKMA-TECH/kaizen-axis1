-- Fix profile/member lookups after chat info panels.
-- The previous policies queried chat_group_members from policies that also
-- apply to chat_group_members, which can recurse and make profile lookups fail.

CREATE OR REPLACE FUNCTION public.is_chat_group_member(
  p_group_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_group_members cgm
    WHERE cgm.group_id = p_group_id
      AND cgm.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_users_share_group(
  p_user_id uuid,
  p_other_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_group_members me
    JOIN public.chat_group_members other_member
      ON other_member.group_id = me.group_id
    WHERE me.user_id = p_user_id
      AND other_member.user_id = p_other_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_chat_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_users_share_group(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "members_see_membership" ON public.chat_group_members;

CREATE POLICY "members_see_membership"
ON public.chat_group_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_chat_group_member(group_id, auth.uid())
);

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
    OR public.chat_users_share_group(auth.uid(), profiles.id)
  )
);
