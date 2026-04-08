CREATE OR REPLACE FUNCTION public.get_clients_hierarchy_tags(p_client_ids uuid[])
RETURNS TABLE (
  client_id uuid,
  owner_name text,
  coordinator_name text,
  team_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS client_id,
    owner_p.name AS owner_name,
    coord_p.name AS coordinator_name,
    t.name AS team_name
  FROM public.clients c
  LEFT JOIN public.profiles owner_p
    ON owner_p.id = c.owner_id
  LEFT JOIN public.profiles coord_p
    ON coord_p.id = owner_p.coordinator_id
  LEFT JOIN public.teams t
    ON t.id = COALESCE(
      owner_p.team_id,
      CASE
        WHEN owner_p.team ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN owner_p.team::uuid
        ELSE NULL
      END
    )
  WHERE c.id = ANY(p_client_ids)
    AND c.owner_id IS NOT NULL
    AND public.app_user_in_scope(c.owner_id);
$$;

REVOKE ALL ON FUNCTION public.get_clients_hierarchy_tags(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clients_hierarchy_tags(uuid[]) TO authenticated, service_role;
