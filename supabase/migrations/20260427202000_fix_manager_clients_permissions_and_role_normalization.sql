-- Fix: gerente sem permissao para atualizar/excluir clientes e mudar etapa
-- Causas tratadas:
-- 1) role com espacos/quebra de comparacao exata ('GERENTE ')
-- 2) policy de clients usando cast legado p.team::uuid (fragil)

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;

-- Normaliza roles legados para evitar falhas de comparacao por espacos
UPDATE public.profiles
SET role = btrim(role)
WHERE role IS NOT NULL
  AND role <> btrim(role);

-- Helper de role com trim defensivo (usado por policies e RPCs)
CREATE OR REPLACE FUNCTION public.app_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT UPPER(btrim(COALESCE(role, '')))
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.app_current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_current_user_role() TO authenticated, service_role;

DROP POLICY IF EXISTS clients_update_scoped ON public.clients;
DROP POLICY IF EXISTS clients_delete_scoped ON public.clients;

CREATE POLICY clients_update_scoped
ON public.clients
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR (
    public.app_current_user_role() = 'COORDENADOR'
    AND owner_id IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.coordinator_id = auth.uid()
    )
  )
  OR (
    public.app_current_user_role() = 'GERENTE'
    AND (
      owner_id IN (
        SELECT p.id
        FROM public.profiles p
        WHERE p.manager_id = auth.uid()
      )
      OR owner_id IN (
        SELECT p.id
        FROM public.profiles p
        INNER JOIN public.teams t
          ON t.id = COALESCE(
            p.team_id,
            public.resolve_profile_team_id(p.team_id, p.team::text)
          )
        WHERE t.manager_id = auth.uid()
      )
      OR owner_id IN (
        SELECT p.id
        FROM public.profiles p
        WHERE p.coordinator_id IN (
          SELECT c.id
          FROM public.profiles c
          WHERE c.manager_id = auth.uid()
        )
      )
    )
  )
  OR public.app_current_user_role() IN ('ADMIN', 'DIRETOR')
)
WITH CHECK (
  owner_id = auth.uid()
  OR (
    public.app_current_user_role() = 'COORDENADOR'
    AND owner_id IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.coordinator_id = auth.uid()
    )
  )
  OR (
    public.app_current_user_role() = 'GERENTE'
    AND (
      owner_id IN (
        SELECT p.id
        FROM public.profiles p
        WHERE p.manager_id = auth.uid()
      )
      OR owner_id IN (
        SELECT p.id
        FROM public.profiles p
        INNER JOIN public.teams t
          ON t.id = COALESCE(
            p.team_id,
            public.resolve_profile_team_id(p.team_id, p.team::text)
          )
        WHERE t.manager_id = auth.uid()
      )
      OR owner_id IN (
        SELECT p.id
        FROM public.profiles p
        WHERE p.coordinator_id IN (
          SELECT c.id
          FROM public.profiles c
          WHERE c.manager_id = auth.uid()
        )
      )
    )
  )
  OR public.app_current_user_role() IN ('ADMIN', 'DIRETOR')
);

CREATE POLICY clients_delete_scoped
ON public.clients
FOR DELETE
TO authenticated
USING (
  owner_id = auth.uid()
  OR (
    public.app_current_user_role() = 'COORDENADOR'
    AND owner_id IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.coordinator_id = auth.uid()
    )
  )
  OR (
    public.app_current_user_role() = 'GERENTE'
    AND (
      owner_id IN (
        SELECT p.id
        FROM public.profiles p
        WHERE p.manager_id = auth.uid()
      )
      OR owner_id IN (
        SELECT p.id
        FROM public.profiles p
        INNER JOIN public.teams t
          ON t.id = COALESCE(
            p.team_id,
            public.resolve_profile_team_id(p.team_id, p.team::text)
          )
        WHERE t.manager_id = auth.uid()
      )
      OR owner_id IN (
        SELECT p.id
        FROM public.profiles p
        WHERE p.coordinator_id IN (
          SELECT c.id
          FROM public.profiles c
          WHERE c.manager_id = auth.uid()
        )
      )
    )
  )
  OR public.app_current_user_role() IN ('ADMIN', 'DIRETOR')
);
