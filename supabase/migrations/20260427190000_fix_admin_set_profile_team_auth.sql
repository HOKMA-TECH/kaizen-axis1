-- Ajuste de autorizacao do RPC admin_set_profile_team
-- Permite execucao via SQL Editor (postgres/supabase_admin) e service role,
-- mantendo restricao ADMIN/DIRETOR para chamadas vindas do app.

CREATE OR REPLACE FUNCTION public.admin_set_profile_team(
  p_profile_id uuid,
  p_team_id uuid DEFAULT NULL,
  p_coordinator_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_team record;
  v_coordinator_id uuid;
  v_is_db_admin boolean;
BEGIN
  v_role := upper(coalesce(public.app_current_user_role(), ''));
  v_is_db_admin := current_user IN ('postgres', 'supabase_admin');

  IF NOT v_is_db_admin
     AND auth.role() <> 'service_role'
     AND v_role NOT IN ('ADMIN', 'DIRETOR') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'p_profile_id is required';
  END IF;

  IF p_team_id IS NULL THEN
    UPDATE public.profiles
    SET
      team_id = NULL,
      team = NULL,
      manager_id = NULL,
      coordinator_id = NULL
    WHERE id = p_profile_id;

    UPDATE public.teams
    SET members = array_remove(coalesce(members, '{}'::uuid[]), p_profile_id)
    WHERE p_profile_id = ANY(coalesce(members, '{}'::uuid[]));

    RETURN;
  END IF;

  SELECT id, directorate_id, manager_id
  INTO v_team
  FROM public.teams
  WHERE id = p_team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'team not found: %', p_team_id;
  END IF;

  v_coordinator_id := p_coordinator_id;
  IF v_coordinator_id IS NULL THEN
    SELECT p.id
    INTO v_coordinator_id
    FROM public.profiles p
    WHERE p.team_id = p_team_id
      AND upper(coalesce(p.role, '')) = 'COORDENADOR'
      AND lower(coalesce(p.status, '')) IN ('ativo', 'active', '')
    ORDER BY p.id
    LIMIT 1;
  END IF;

  UPDATE public.profiles
  SET
    team_id = p_team_id,
    team = p_team_id::text,
    directorate_id = v_team.directorate_id,
    manager_id = v_team.manager_id,
    coordinator_id = v_coordinator_id
  WHERE id = p_profile_id;

  UPDATE public.teams
  SET members = array_remove(coalesce(members, '{}'::uuid[]), p_profile_id)
  WHERE id <> p_team_id
    AND p_profile_id = ANY(coalesce(members, '{}'::uuid[]));

  UPDATE public.teams
  SET members = CASE
    WHEN p_profile_id = ANY(coalesce(members, '{}'::uuid[])) THEN coalesce(members, '{}'::uuid[])
    ELSE array_append(coalesce(members, '{}'::uuid[]), p_profile_id)
  END
  WHERE id = p_team_id;
END;
$$;
