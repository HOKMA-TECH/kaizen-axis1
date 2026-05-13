-- ============================================================
-- Consolidação da hierarquia de visibilidade de clientes
--
-- Problema raiz identificado em 2026-05-13:
--   A policy profiles_select_scoped (20260330170000) exige
--   directorate_id IS NOT NULL para GERENTEs verem outros profiles.
--   GERENTEs sem directorate_id (ex: Caroline) ficavam cegos para
--   seus próprios corretores → subqueries em clients retornavam
--   vazio → 0 clientes visíveis.
--
-- Solução:
--   Substituir subqueries em profiles (sujeitas ao RLS de profiles)
--   por funções SECURITY DEFINER que bypassam o RLS e retornam
--   diretamente os IDs de corretores no escopo de cada role.
--
-- Resultado final (hierarquia garantida no banco):
--   CORRETOR  → apenas os próprios clientes
--   COORDENADOR → corretores com coordinator_id = seu id
--   GERENTE   → equipe completa (manager_id + team_id via teams)
--   DIRETOR   → todos os profiles da sua diretoria (directorate_id)
--   ADMIN     → todos
-- ============================================================

-- ── Restaura profiles_select_scoped ao estado original ──────────────────────
-- (desfaz tentativas de fix que quebraram o escopo de outros roles)

DROP POLICY IF EXISTS profiles_select_scoped ON public.profiles;

CREATE POLICY profiles_select_scoped
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    id = auth.uid()

    OR public.app_current_user_role() = 'ADMIN'

    OR (
      public.app_current_user_role() IN ('DIRETOR', 'GERENTE')
      AND public.app_current_user_directorate_id() IS NOT NULL
      AND directorate_id = public.app_current_user_directorate_id()
    )

    OR (
      public.app_current_user_role() = 'COORDENADOR'
      AND (
        id = public.app_current_user_manager_id()
        OR coordinator_id = auth.uid()
        OR (
          public.app_current_user_team_id() IS NOT NULL
          AND team_id = public.app_current_user_team_id()
        )
        OR (
          public.app_current_user_team() IS NOT NULL
          AND team IS NOT NULL
          AND team = public.app_current_user_team()
        )
      )
    )

    OR (
      public.app_current_user_role() = 'CORRETOR'
      AND (
        id = public.app_current_user_manager_id()
        OR id = public.app_current_user_coordinator_id()
        OR (
          public.app_current_user_team_id() IS NOT NULL
          AND team_id = public.app_current_user_team_id()
        )
        OR (
          public.app_current_user_team() IS NOT NULL
          AND team IS NOT NULL
          AND team = public.app_current_user_team()
        )
      )
    )
  )
);

-- ── Função: IDs de corretores visíveis para um GERENTE ───────────────────────
-- Bypassa profiles RLS para não depender de directorate_id.
-- Inclui: subordinados diretos (manager_id), membros do time (team_id→teams),
-- e corretores cujo coordenador está sob o gerente.

CREATE OR REPLACE FUNCTION public.get_manager_corretor_ids(p_manager_id uuid)
RETURNS TABLE(corretor_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id FROM public.profiles p WHERE p.manager_id = p_manager_id
  UNION
  SELECT p.id FROM public.profiles p
    INNER JOIN public.teams t ON t.id = p.team_id
    WHERE t.manager_id = p_manager_id
  UNION
  SELECT p.id FROM public.profiles p
    WHERE p.coordinator_id IN (
      SELECT c.id FROM public.profiles c WHERE c.manager_id = p_manager_id
    );
$$;

REVOKE ALL ON FUNCTION public.get_manager_corretor_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_manager_corretor_ids(uuid) TO authenticated, service_role;

-- ── Função: IDs de profiles visíveis para um DIRETOR ────────────────────────
-- Retorna todos os profiles que compartilham a mesma diretoria do DIRETOR,
-- excluindo o próprio DIRETOR (owner_id = auth.uid() já cobre isso).

CREATE OR REPLACE FUNCTION public.get_diretor_corretor_ids(p_diretor_id uuid)
RETURNS TABLE(corretor_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.directorate_id = (
    SELECT directorate_id FROM public.profiles WHERE id = p_diretor_id LIMIT 1
  )
  AND p.id <> p_diretor_id;
$$;

REVOKE ALL ON FUNCTION public.get_diretor_corretor_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_diretor_corretor_ids(uuid) TO authenticated, service_role;

-- ── Consolida todas as policies SELECT de clients numa só ───────────────────
-- Remove as políticas fragmentadas anteriores e cria uma unificada.

DROP POLICY IF EXISTS "manager_view_team_clients"       ON public.clients;
DROP POLICY IF EXISTS "coordinator_view_team_clients"   ON public.clients;
DROP POLICY IF EXISTS "director_admin_view_all_clients" ON public.clients;
DROP POLICY IF EXISTS "clients_select_scoped"           ON public.clients;

CREATE POLICY "clients_select_scoped"
ON public.clients
FOR SELECT
TO authenticated
USING (
  -- CORRETOR: apenas os próprios clientes
  owner_id = auth.uid()

  OR

  -- COORDENADOR: seus corretores (coordinator_id = seu id)
  (
    public.app_current_user_role() = 'COORDENADOR'
    AND owner_id IN (
      SELECT p.id FROM public.profiles p WHERE p.coordinator_id = auth.uid()
    )
  )

  OR

  -- GERENTE: equipe completa via SECURITY DEFINER (independe de directorate_id)
  (
    public.app_current_user_role() = 'GERENTE'
    AND owner_id IN (
      SELECT corretor_id FROM public.get_manager_corretor_ids(auth.uid())
    )
  )

  OR

  -- DIRETOR: todos os profiles da sua diretoria via SECURITY DEFINER
  (
    public.app_current_user_role() = 'DIRETOR'
    AND owner_id IN (
      SELECT corretor_id FROM public.get_diretor_corretor_ids(auth.uid())
    )
  )

  OR

  -- ADMIN: visibilidade total
  public.app_current_user_role() = 'ADMIN'
);
