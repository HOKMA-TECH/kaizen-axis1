-- Security hardening: profiles exposure + global RLS review
-- 1) Tighten profiles access (scoped by role/hierarchy)
-- 2) Ensure RLS is enabled across all public tables
-- 3) Remove anon table access in public schema

-- ──────────────────────────────────────────────────────────────────────────────
-- Helper functions (SECURITY DEFINER) to read requester profile safely
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.app_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT UPPER(COALESCE(role, ''))
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_current_user_directorate_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT directorate_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_current_user_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_current_user_team()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_current_user_manager_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT manager_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_current_user_coordinator_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coordinator_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.app_current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_current_user_directorate_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_current_user_team_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_current_user_team() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_current_user_manager_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_current_user_coordinator_id() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.app_current_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_current_user_directorate_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_current_user_team_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_current_user_team() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_current_user_manager_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.app_current_user_coordinator_id() TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- Harden profiles table RLS
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- SELECT: scoped visibility by role/hierarchy
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
      AND directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id()
    )

    OR (
      public.app_current_user_role() = 'COORDENADOR'
      AND (
        id = public.app_current_user_manager_id()
        OR coordinator_id = auth.uid()
        OR team_id IS NOT DISTINCT FROM public.app_current_user_team_id()
        OR (team IS NOT NULL AND team = public.app_current_user_team())
      )
    )

    OR (
      public.app_current_user_role() = 'CORRETOR'
      AND (
        id = public.app_current_user_manager_id()
        OR id = public.app_current_user_coordinator_id()
        OR team_id IS NOT DISTINCT FROM public.app_current_user_team_id()
        OR (team IS NOT NULL AND team = public.app_current_user_team())
      )
    )
  )
);

-- INSERT: user can only insert own profile; service_role bypasses RLS
CREATE POLICY profiles_insert_own
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- UPDATE: user can update own profile
CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- UPDATE/DELETE elevated: admin all; director only within own directorate and never ADMIN rows
CREATE POLICY profiles_admin_director_manage
ON public.profiles
FOR ALL
TO authenticated
USING (
  public.app_current_user_role() = 'ADMIN'
  OR (
    public.app_current_user_role() = 'DIRETOR'
    AND directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id()
    AND UPPER(COALESCE(role, '')) <> 'ADMIN'
  )
)
WITH CHECK (
  public.app_current_user_role() = 'ADMIN'
  OR (
    public.app_current_user_role() = 'DIRETOR'
    AND directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id()
    AND UPPER(COALESCE(role, '')) <> 'ADMIN'
  )
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Global RLS review baseline for all public tables
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'schema_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- Remove anonymous table access in public schema (PostgREST anon)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
