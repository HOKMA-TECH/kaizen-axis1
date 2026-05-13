-- ============================================================
-- SUPERSEDED by 20260513250000_consolidate_clients_hierarchy_rls.sql
-- Este arquivo continha uma tentativa de fix que foi substituída.
-- A solução final usa funções SECURITY DEFINER no clients RLS
-- em vez de modificar o profiles_select_scoped.
-- ============================================================

-- ============================================================
-- FIX: profiles_select_scoped — scope GERENTE by team, not directorate
--
-- Bug: GERENTEs were scoped by directorate_id, which caused two problems:
--   1. GERENTEs without directorate_id (e.g. Caroline) saw 0 profiles → 0 clients
--   2. GERENTEs with directorate_id saw 66+ profiles (entire directorate)
--      which, via the coordinator cascade in clients RLS, inflated visibility
--      to 393 clients for a team of 11 (Marvyn case)
--
-- Fix: GERENTEs now see only profiles where manager_id = their own id
--      OR profiles in their own team (by team_id). No directorate_id required.
-- ============================================================

DROP POLICY IF EXISTS profiles_select_scoped ON public.profiles;

CREATE POLICY profiles_select_scoped
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    -- Own profile: always visible
    id = auth.uid()

    OR public.app_current_user_role() = 'ADMIN'

    -- DIRETOR: directorate-wide scope (unchanged)
    OR (
      public.app_current_user_role() = 'DIRETOR'
      AND public.app_current_user_directorate_id() IS NOT NULL
      AND directorate_id = public.app_current_user_directorate_id()
    )

    -- GERENTE: only profiles in their team hierarchy
    -- (manager_id = their id, or same team_id)
    -- Does NOT require directorate_id — fixes Caroline (NULL) and Marvyn (over-broad)
    OR (
      public.app_current_user_role() = 'GERENTE'
      AND (
        manager_id = auth.uid()
        OR (
          public.app_current_user_team_id() IS NOT NULL
          AND team_id = public.app_current_user_team_id()
        )
      )
    )

    -- COORDENADOR: unchanged
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

    -- CORRETOR: unchanged
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
