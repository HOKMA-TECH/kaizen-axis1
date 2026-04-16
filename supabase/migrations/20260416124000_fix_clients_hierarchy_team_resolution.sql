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
    resolved_team.name AS team_name
  FROM public.clients c
  LEFT JOIN public.profiles owner_p
    ON owner_p.id = c.owner_id
  LEFT JOIN public.profiles coord_p
    ON coord_p.id = owner_p.coordinator_id
  LEFT JOIN LATERAL (
    SELECT t.name
    FROM public.teams t
    WHERE t.id = owner_p.team_id
    OR t.id = CASE
      WHEN owner_p.team ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN owner_p.team::uuid
      ELSE NULL
    END
    OR (
      c.owner_id IS NOT NULL
      AND COALESCE(t.members, '[]'::jsonb) ? c.owner_id::text
    )
    ORDER BY
      CASE
        WHEN t.id = owner_p.team_id THEN 0
        WHEN t.id = CASE
          WHEN owner_p.team ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN owner_p.team::uuid
          ELSE NULL
        END THEN 1
        WHEN c.owner_id IS NOT NULL AND COALESCE(t.members, '[]'::jsonb) ? c.owner_id::text THEN 2
        ELSE 3
      END,
      t.name ASC
    LIMIT 1
  ) resolved_team ON TRUE
  WHERE c.id = ANY(p_client_ids)
    AND c.owner_id IS NOT NULL
    AND public.app_user_in_scope(c.owner_id);
$$;

REVOKE ALL ON FUNCTION public.get_clients_hierarchy_tags(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clients_hierarchy_tags(uuid[]) TO authenticated, service_role;
