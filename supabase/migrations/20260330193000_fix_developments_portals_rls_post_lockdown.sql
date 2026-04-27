-- Hotfix: restore developments and portals visibility after RLS lockdown.
-- Read: any authenticated user.
-- Write: strategic roles only (ADMIN, DIRETOR).

ALTER TABLE public.developments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.portals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portals FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'developments'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.developments', pol.policyname);
  END LOOP;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portals'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.portals', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY developments_select_authenticated
ON public.developments
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY developments_insert_strategic
ON public.developments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR')
);

CREATE POLICY developments_update_strategic
ON public.developments
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR')
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR')
);

CREATE POLICY developments_delete_strategic
ON public.developments
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR')
);

CREATE POLICY portals_select_authenticated
ON public.portals
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY portals_insert_strategic
ON public.portals
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR')
);

CREATE POLICY portals_update_strategic
ON public.portals
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR')
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR')
);

CREATE POLICY portals_delete_strategic
ON public.portals
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.app_current_user_role() IN ('ADMIN', 'DIRETOR')
);
