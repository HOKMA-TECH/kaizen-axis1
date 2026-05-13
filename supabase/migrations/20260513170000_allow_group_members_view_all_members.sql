-- Let any member see the full membership list of groups they belong to.
-- The group profile panel needs this to show all participants, while still
-- keeping memberships hidden from users outside the group.

DROP POLICY IF EXISTS "members_see_membership" ON public.chat_group_members;

CREATE POLICY "members_see_membership"
ON public.chat_group_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.chat_group_members me
    WHERE me.group_id = chat_group_members.group_id
      AND me.user_id = auth.uid()
  )
);
