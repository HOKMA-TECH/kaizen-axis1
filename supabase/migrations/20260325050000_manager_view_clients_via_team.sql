-- Complementa a policy do gerente para também cobrir membros de times
-- onde teams.manager_id = gerente (caso o profile.manager_id não esteja preenchido)

DROP POLICY IF EXISTS "manager_view_team_clients" ON public.clients;

CREATE POLICY "manager_view_team_clients" ON public.clients
  FOR SELECT
  TO authenticated
  USING (
    -- Próprios clientes
    owner_id = auth.uid()
    OR
    -- Subordinados diretos (manager_id = gerente)
    owner_id IN (
      SELECT id FROM public.profiles
      WHERE manager_id = auth.uid()
    )
    OR
    -- Membros dos times gerenciados pelo gerente (fallback)
    owner_id IN (
      SELECT p.id FROM public.profiles p
      INNER JOIN public.teams t ON t.id = p.team
      WHERE t.manager_id = auth.uid()
    )
    OR
    -- Corretores cujo coordenador pertence ao gerente
    owner_id IN (
      SELECT p.id FROM public.profiles p
      WHERE p.coordinator_id IN (
        SELECT id FROM public.profiles
        WHERE manager_id = auth.uid()
      )
    )
  );
