-- Hotfix: restore tasks CRUD after global RLS lockdown
-- Rebuild scoped policies for authenticated users by hierarchy.

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.app_user_in_scope(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      target_user_id = auth.uid()
      OR public.app_current_user_role() IN ('ADMIN', 'DIRETOR')
      OR (
        public.app_current_user_role() = 'COORDENADOR'
        AND target_user_id IN (
          SELECT p.id
          FROM public.profiles p
          WHERE p.coordinator_id = auth.uid()
        )
      )
      OR (
        public.app_current_user_role() = 'GERENTE'
        AND (
          target_user_id IN (
            SELECT p.id
            FROM public.profiles p
            WHERE p.manager_id = auth.uid()
          )
          OR target_user_id IN (
            SELECT p.id
            FROM public.profiles p
            INNER JOIN public.teams t ON t.id = p.team::uuid
            WHERE t.manager_id = auth.uid()
          )
          OR target_user_id IN (
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
    );
$$;

REVOKE ALL ON FUNCTION public.app_user_in_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_user_in_scope(uuid) TO authenticated, service_role;

DO $$
DECLARE
  pol record;
  owner_col text;
BEGIN
  SELECT c.column_name
  INTO owner_col
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'tasks'
    AND c.column_name IN ('owner_id', 'user_id', 'responsible_id', 'created_by', 'assigned_to')
  ORDER BY CASE c.column_name
    WHEN 'owner_id' THEN 1
    WHEN 'user_id' THEN 2
    WHEN 'assigned_to' THEN 3
    WHEN 'responsible_id' THEN 4
    WHEN 'created_by' THEN 5
    ELSE 99
  END
  LIMIT 1;

  IF owner_col IS NULL THEN
    RAISE EXCEPTION 'No owner/user column found in public.tasks';
  END IF;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tasks'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks', pol.policyname);
  END LOOP;

  EXECUTE format(
    'CREATE POLICY tasks_select_scoped ON public.tasks FOR SELECT TO authenticated USING (public.app_user_in_scope(%I))',
    owner_col
  );

  EXECUTE format(
    'CREATE POLICY tasks_insert_scoped ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.app_user_in_scope(%I))',
    owner_col
  );

  EXECUTE format(
    'CREATE POLICY tasks_update_scoped ON public.tasks FOR UPDATE TO authenticated USING (public.app_user_in_scope(%I)) WITH CHECK (public.app_user_in_scope(%I))',
    owner_col,
    owner_col
  );

  EXECUTE format(
    'CREATE POLICY tasks_delete_scoped ON public.tasks FOR DELETE TO authenticated USING (public.app_user_in_scope(%I))',
    owner_col
  );
END $$;
