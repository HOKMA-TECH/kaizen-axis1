-- Hotfix: restore trainings + training_completions after global RLS lockdown

ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.training_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_completions FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
  training_owner_col text;
  completion_user_col text;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trainings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.trainings', pol.policyname);
  END LOOP;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'training_completions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.training_completions', pol.policyname);
  END LOOP;

  SELECT c.column_name
  INTO training_owner_col
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'trainings'
    AND c.column_name IN ('created_by', 'owner_id', 'user_id')
  ORDER BY CASE c.column_name
    WHEN 'created_by' THEN 1
    WHEN 'owner_id' THEN 2
    WHEN 'user_id' THEN 3
    ELSE 99
  END
  LIMIT 1;

  SELECT c.column_name
  INTO completion_user_col
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'training_completions'
    AND c.column_name IN ('user_id', 'owner_id', 'created_by')
  ORDER BY CASE c.column_name
    WHEN 'user_id' THEN 1
    WHEN 'owner_id' THEN 2
    WHEN 'created_by' THEN 3
    ELSE 99
  END
  LIMIT 1;

  EXECUTE '
    CREATE POLICY trainings_select_authenticated
    ON public.trainings
    FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL)
  ';

  IF training_owner_col IS NULL THEN
    EXECUTE '
      CREATE POLICY trainings_insert_strategic
      ON public.trainings
      FOR INSERT
      TO authenticated
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND public.app_current_user_role() IN (''ADMIN'', ''DIRETOR'')
      )
    ';

    EXECUTE '
      CREATE POLICY trainings_update_strategic
      ON public.trainings
      FOR UPDATE
      TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND public.app_current_user_role() IN (''ADMIN'', ''DIRETOR'')
      )
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND public.app_current_user_role() IN (''ADMIN'', ''DIRETOR'')
      )
    ';

    EXECUTE '
      CREATE POLICY trainings_delete_strategic
      ON public.trainings
      FOR DELETE
      TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND public.app_current_user_role() IN (''ADMIN'', ''DIRETOR'')
      )
    ';
  ELSE
    EXECUTE format(
      'CREATE POLICY trainings_insert_strategic ON public.trainings FOR INSERT TO authenticated WITH CHECK (
        auth.uid() IS NOT NULL
        AND public.app_current_user_role() IN (''ADMIN'', ''DIRETOR'')
        AND %I = auth.uid()
      )',
      training_owner_col
    );

    EXECUTE format(
      'CREATE POLICY trainings_update_scoped ON public.trainings FOR UPDATE TO authenticated USING (
        auth.uid() IS NOT NULL
        AND (
          public.app_current_user_role() IN (''ADMIN'', ''DIRETOR'')
          OR %I = auth.uid()
        )
      ) WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
          public.app_current_user_role() IN (''ADMIN'', ''DIRETOR'')
          OR %I = auth.uid()
        )
      )',
      training_owner_col,
      training_owner_col
    );

    EXECUTE format(
      'CREATE POLICY trainings_delete_scoped ON public.trainings FOR DELETE TO authenticated USING (
        auth.uid() IS NOT NULL
        AND (
          public.app_current_user_role() IN (''ADMIN'', ''DIRETOR'')
          OR %I = auth.uid()
        )
      )',
      training_owner_col
    );
  END IF;

  IF completion_user_col IS NULL THEN
    RAISE EXCEPTION 'No user/owner column found in public.training_completions';
  END IF;

  EXECUTE format(
    'CREATE POLICY training_completions_select_scoped ON public.training_completions FOR SELECT TO authenticated USING (
      auth.uid() IS NOT NULL
      AND (
        %I = auth.uid()
        OR public.app_current_user_role() IN (''ADMIN'', ''DIRETOR'')
      )
    )',
    completion_user_col
  );

  EXECUTE format(
    'CREATE POLICY training_completions_insert_own ON public.training_completions FOR INSERT TO authenticated WITH CHECK (
      auth.uid() IS NOT NULL
      AND %I = auth.uid()
    )',
    completion_user_col
  );

  EXECUTE format(
    'CREATE POLICY training_completions_update_own ON public.training_completions FOR UPDATE TO authenticated USING (
      auth.uid() IS NOT NULL
      AND %I = auth.uid()
    ) WITH CHECK (
      auth.uid() IS NOT NULL
      AND %I = auth.uid()
    )',
    completion_user_col,
    completion_user_col
  );

  EXECUTE format(
    'CREATE POLICY training_completions_delete_scoped ON public.training_completions FOR DELETE TO authenticated USING (
      auth.uid() IS NOT NULL
      AND (
        %I = auth.uid()
        OR public.app_current_user_role() IN (''ADMIN'', ''DIRETOR'')
      )
    )',
    completion_user_col
  );
END $$;
