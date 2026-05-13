-- Allow only the group creator/admin to delete their own chat group.
-- Related group members and group messages are removed by existing cascades.

DROP POLICY IF EXISTS "creator_delete_group" ON public.chat_groups;

CREATE POLICY "creator_delete_group"
ON public.chat_groups
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
);
