-- Let regular members leave groups by removing only their own membership.
-- Group creators stay protected so every group keeps its administrator.

DROP POLICY IF EXISTS "members_leave_group" ON public.chat_group_members;

CREATE POLICY "members_leave_group"
ON public.chat_group_members
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND public.chat_group_creator(group_id) IS DISTINCT FROM auth.uid()
);
