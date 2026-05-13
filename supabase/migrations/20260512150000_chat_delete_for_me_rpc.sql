CREATE OR REPLACE FUNCTION public.chat_delete_for_me(p_message_id uuid, p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE chat_messages
  SET deleted_for = array_append(
    COALESCE(deleted_for, '{}'),
    p_user_id
  )
  WHERE id = p_message_id
    AND NOT (p_user_id = ANY(COALESCE(deleted_for, '{}')));
$$;

REVOKE ALL ON FUNCTION public.chat_delete_for_me(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_delete_for_me(uuid, uuid) TO authenticated, service_role;
