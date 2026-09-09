-- A-06: helpers de hierarquia só enumeram subordinados do próprio JWT.
-- Mantém GRANT EXECUTE para authenticated (policies de clients dependem disso).

CREATE OR REPLACE FUNCTION public.get_manager_corretor_ids(p_manager_id uuid)
RETURNS TABLE(corretor_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND p_manager_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id AS corretor_id FROM public.profiles p WHERE p.manager_id = p_manager_id
  UNION
  SELECT p.id AS corretor_id FROM public.profiles p
    INNER JOIN public.teams t ON t.id = p.team_id
    WHERE t.manager_id = p_manager_id
  UNION
  SELECT p.id AS corretor_id FROM public.profiles p
    WHERE p.coordinator_id IN (
      SELECT c.id FROM public.profiles c WHERE c.manager_id = p_manager_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_diretor_corretor_ids(p_diretor_id uuid)
RETURNS TABLE(corretor_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND p_diretor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id AS corretor_id
  FROM public.profiles p
  WHERE p.directorate_id = (
    SELECT directorate_id FROM public.profiles WHERE id = p_diretor_id LIMIT 1
  )
  AND p.id <> p_diretor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_manager_corretor_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_diretor_corretor_ids(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_manager_corretor_ids(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_diretor_corretor_ids(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_manager_corretor_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_diretor_corretor_ids(uuid) TO authenticated, service_role;
