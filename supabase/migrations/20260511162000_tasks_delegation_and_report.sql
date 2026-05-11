-- Tasks delegation + reporting

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS assigned_by_role text,
  ADD COLUMN IF NOT EXISTS assignment_scope text DEFAULT 'INDIVIDUAL',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE public.tasks
SET created_by = COALESCE(created_by, owner_id, user_id)
WHERE created_by IS NULL;

UPDATE public.tasks
SET assigned_to = COALESCE(assigned_to, owner_id, user_id)
WHERE assigned_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON public.tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status_deadline ON public.tasks(assigned_to, status, deadline);

CREATE OR REPLACE FUNCTION public.can_assign_task_to(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND target_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p_target
      WHERE p_target.id = target_user_id
        AND UPPER(COALESCE(p_target.role, '')) = 'CORRETOR'
    )
    AND (
      public.app_current_user_role() IN ('ADMIN', 'DIRETOR')
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
            WHERE p.coordinator_id IN (
              SELECT c.id
              FROM public.profiles c
              WHERE c.manager_id = auth.uid()
            )
          )
          OR target_user_id IN (
            SELECT p.id
            FROM public.profiles p
            INNER JOIN public.teams t ON t.id = p.team::uuid
            WHERE t.manager_id = auth.uid()
          )
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_assign_task_to(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_assign_task_to(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS tasks_select_scoped ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_scoped ON public.tasks;
DROP POLICY IF EXISTS tasks_update_scoped ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_scoped ON public.tasks;

CREATE POLICY tasks_select_scoped ON public.tasks
FOR SELECT TO authenticated
USING (
  public.app_user_in_scope(COALESCE(assigned_to, owner_id, user_id, created_by))
  OR created_by = auth.uid()
);

CREATE POLICY tasks_insert_scoped ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    assigned_to = auth.uid()
    OR public.can_assign_task_to(assigned_to)
  )
);

CREATE POLICY tasks_update_scoped ON public.tasks
FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR public.can_assign_task_to(COALESCE(assigned_to, owner_id, user_id, created_by))
  OR assigned_to = auth.uid()
)
WITH CHECK (
  created_by = auth.uid()
  OR public.can_assign_task_to(COALESCE(assigned_to, owner_id, user_id, created_by))
  OR assigned_to = auth.uid()
);

CREATE POLICY tasks_delete_scoped ON public.tasks
FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR public.can_assign_task_to(COALESCE(assigned_to, owner_id, user_id, created_by))
);

CREATE OR REPLACE FUNCTION public.tasks_report(
  p_start date,
  p_end date,
  p_assigned_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_total integer;
  v_pending integer;
  v_in_progress integer;
  v_done integer;
  v_overdue integer;
BEGIN
  WITH scoped AS (
    SELECT t.*
    FROM public.tasks t
    WHERE (p_assigned_to IS NULL OR t.assigned_to = p_assigned_to)
      AND t.created_at::date BETWEEN p_start AND p_end
      AND (
        public.app_user_in_scope(COALESCE(t.assigned_to, t.owner_id, t.user_id, t.created_by))
        OR t.created_by = auth.uid()
      )
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'Pendente'),
    COUNT(*) FILTER (WHERE status = 'Em Andamento'),
    COUNT(*) FILTER (WHERE status = 'Concluída'),
    COUNT(*) FILTER (WHERE status <> 'Concluída' AND deadline IS NOT NULL AND deadline::date < CURRENT_DATE)
  INTO v_total, v_pending, v_in_progress, v_done, v_overdue
  FROM scoped;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'concluidas')::int DESC, (row_data->>'total')::int DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'assigned_to', s.assigned_to,
      'responsavel', p.name,
      'total', COUNT(*),
      'concluidas', COUNT(*) FILTER (WHERE s.status = 'Concluída'),
      'pendentes', COUNT(*) FILTER (WHERE s.status = 'Pendente'),
      'em_andamento', COUNT(*) FILTER (WHERE s.status = 'Em Andamento')
    ) AS row_data
    FROM scoped s
    LEFT JOIN public.profiles p ON p.id = s.assigned_to
    GROUP BY s.assigned_to, p.name
  ) ranked;

  RETURN jsonb_build_object(
    'kpis', jsonb_build_object(
      'total', COALESCE(v_total, 0),
      'pendentes', COALESCE(v_pending, 0),
      'em_andamento', COALESCE(v_in_progress, 0),
      'concluidas', COALESCE(v_done, 0),
      'atrasadas', COALESCE(v_overdue, 0),
      'taxa_conclusao', CASE WHEN COALESCE(v_total, 0) = 0 THEN 0 ELSE ROUND((v_done::numeric * 100.0) / v_total, 2) END
    ),
    'ranking', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tasks_report(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tasks_report(date, date, uuid) TO authenticated, service_role;
