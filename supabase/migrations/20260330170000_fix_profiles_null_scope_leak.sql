-- Fix critical leak in profiles_select_scoped caused by NULL team_id comparisons
-- Problem: "team_id IS NOT DISTINCT FROM app_current_user_team_id()" leaks rows when both are NULL.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

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
