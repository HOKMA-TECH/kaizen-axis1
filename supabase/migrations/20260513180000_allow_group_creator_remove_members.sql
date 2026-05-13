-- Allow the group creator/admin to remove participants from their own group.
-- The creator cannot remove themselves, so the group always keeps an admin.

CREATE OR REPLACE FUNCTION public.chat_group_creator(p_group_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT created_by
  FROM public.chat_groups
  WHERE id = p_group_id
$$;

REVOKE ALL ON FUNCTION public.chat_group_creator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_group_creator(uuid) TO authenticated;

DROP POLICY IF EXISTS "creator_remove_members" ON public.chat_group_members;

CREATE POLICY "creator_remove_members"
ON public.chat_group_members
FOR DELETE
TO authenticated
USING (
  public.chat_group_creator(group_id) = auth.uid()
  AND user_id <> auth.uid()
);
