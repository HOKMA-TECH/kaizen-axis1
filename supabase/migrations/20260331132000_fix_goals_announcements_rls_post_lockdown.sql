-- Hotfix: restore goals/missions and announcements after RLS lockdown

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals FORCE ROW LEVEL SECURITY;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
  goal_owner_col text;
  goal_has_directorate boolean;
  goal_has_assignee_type boolean;
  goal_has_assignee_id boolean;
  ann_owner_col text;
  ann_has_directorate boolean;
  goals_select_condition text;
  goals_insert_condition text;
  goals_update_condition text;
  goals_delete_condition text;
  ann_select_condition text;
  ann_insert_condition text;
  ann_update_condition text;
  ann_delete_condition text;
BEGIN
  -- Cleanup existing policies for both tables
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'goals'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.goals', pol.policyname);
  END LOOP;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'announcements'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.announcements', pol.policyname);
  END LOOP;

  -- Detect goals shape (schema compatibility)
  SELECT c.column_name
  INTO goal_owner_col
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'goals'
    AND c.column_name IN ('owner_id', 'created_by', 'user_id', 'author_id')
  ORDER BY CASE c.column_name
    WHEN 'owner_id' THEN 1
    WHEN 'created_by' THEN 2
    WHEN 'user_id' THEN 3
    WHEN 'author_id' THEN 4
    ELSE 99
  END
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'directorate_id'
  ) INTO goal_has_directorate;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'assignee_type'
  ) INTO goal_has_assignee_type;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'assignee_id'
  ) INTO goal_has_assignee_id;

  -- Base goal conditions
  goals_select_condition :=
    'auth.uid() IS NOT NULL AND (public.app_current_user_role() IN (''ADMIN'',''DIRETOR'')';

  IF goal_has_directorate THEN
    goals_select_condition := goals_select_condition ||
      ' OR directorate_id IS NULL OR directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id()';
  END IF;

  IF goal_has_assignee_type AND goal_has_assignee_id THEN
    goals_select_condition := goals_select_condition ||
      ' OR COALESCE(assignee_type, ''All'') = ''All'' OR '
      || '(assignee_type = ''User'' AND assignee_id::text = auth.uid()::text) OR '
      || '(assignee_type = ''Team'' AND ('
      || 'assignee_id::text = public.app_current_user_team_id()::text OR '
      || 'assignee_id::text = public.app_current_user_team()'
      || '))';
  END IF;

  IF goal_owner_col IS NOT NULL THEN
    goals_select_condition := goals_select_condition || format(' OR %I = auth.uid()', goal_owner_col);
  END IF;

  goals_select_condition := goals_select_condition || ')';

  goals_insert_condition := 'auth.uid() IS NOT NULL AND public.app_current_user_role() IN (''ADMIN'',''DIRETOR'')';
  IF goal_has_directorate THEN
    goals_insert_condition := goals_insert_condition ||
      ' AND (public.app_current_user_role() = ''ADMIN'' OR directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id())';
  END IF;
  IF goal_owner_col IS NOT NULL THEN
    goals_insert_condition := goals_insert_condition || format(' AND %I = auth.uid()', goal_owner_col);
  END IF;

  goals_update_condition := 'auth.uid() IS NOT NULL AND public.app_current_user_role() IN (''ADMIN'',''DIRETOR'')';
  IF goal_has_directorate THEN
    goals_update_condition := goals_update_condition ||
      ' AND (public.app_current_user_role() = ''ADMIN'' OR directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id())';
  END IF;

  goals_delete_condition := goals_update_condition;

  EXECUTE format(
    'CREATE POLICY goals_select_scoped ON public.goals FOR SELECT TO authenticated USING (%s)',
    goals_select_condition
  );

  EXECUTE format(
    'CREATE POLICY goals_insert_strategic ON public.goals FOR INSERT TO authenticated WITH CHECK (%s)',
    goals_insert_condition
  );

  EXECUTE format(
    'CREATE POLICY goals_update_strategic ON public.goals FOR UPDATE TO authenticated USING (%1$s) WITH CHECK (%1$s)',
    goals_update_condition
  );

  EXECUTE format(
    'CREATE POLICY goals_delete_strategic ON public.goals FOR DELETE TO authenticated USING (%s)',
    goals_delete_condition
  );

  -- Detect announcements shape (schema compatibility)
  SELECT c.column_name
  INTO ann_owner_col
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'announcements'
    AND c.column_name IN ('author_id', 'owner_id', 'created_by', 'user_id')
  ORDER BY CASE c.column_name
    WHEN 'author_id' THEN 1
    WHEN 'owner_id' THEN 2
    WHEN 'created_by' THEN 3
    WHEN 'user_id' THEN 4
    ELSE 99
  END
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'directorate_id'
  ) INTO ann_has_directorate;

  ann_select_condition :=
    'auth.uid() IS NOT NULL AND (public.app_current_user_role() = ''ADMIN''';

  IF ann_has_directorate THEN
    ann_select_condition := ann_select_condition ||
      ' OR directorate_id IS NULL OR directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id()';
  END IF;

  IF ann_owner_col IS NOT NULL THEN
    ann_select_condition := ann_select_condition || format(' OR %I = auth.uid()', ann_owner_col);
  END IF;

  ann_select_condition := ann_select_condition || ')';

  ann_insert_condition := 'auth.uid() IS NOT NULL AND public.app_current_user_role() IN (''ADMIN'',''DIRETOR'')';
  IF ann_has_directorate THEN
    ann_insert_condition := ann_insert_condition ||
      ' AND (public.app_current_user_role() = ''ADMIN'' OR directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id())';
  END IF;
  IF ann_owner_col IS NOT NULL THEN
    ann_insert_condition := ann_insert_condition || format(' AND %I = auth.uid()', ann_owner_col);
  END IF;

  ann_update_condition := 'auth.uid() IS NOT NULL AND public.app_current_user_role() IN (''ADMIN'',''DIRETOR'')';
  IF ann_has_directorate THEN
    ann_update_condition := ann_update_condition ||
      ' AND (public.app_current_user_role() = ''ADMIN'' OR directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id())';
  END IF;

  ann_delete_condition := ann_update_condition;

  EXECUTE format(
    'CREATE POLICY announcements_select_scoped ON public.announcements FOR SELECT TO authenticated USING (%s)',
    ann_select_condition
  );

  EXECUTE format(
    'CREATE POLICY announcements_insert_strategic ON public.announcements FOR INSERT TO authenticated WITH CHECK (%s)',
    ann_insert_condition
  );

  EXECUTE format(
    'CREATE POLICY announcements_update_strategic ON public.announcements FOR UPDATE TO authenticated USING (%1$s) WITH CHECK (%1$s)',
    ann_update_condition
  );

  EXECUTE format(
    'CREATE POLICY announcements_delete_strategic ON public.announcements FOR DELETE TO authenticated USING (%s)',
    ann_delete_condition
  );
END $$;
