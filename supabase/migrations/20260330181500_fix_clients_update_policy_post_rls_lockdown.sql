-- Hotfix: restore UPDATE/DELETE permissions on clients after RLS hardening
-- Keeps strict scope by hierarchy and role.

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;

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
        INNER JOIN public.teams t ON t.id = p.team::uuid
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
        INNER JOIN public.teams t ON t.id = p.team::uuid
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
        INNER JOIN public.teams t ON t.id = p.team::uuid
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
