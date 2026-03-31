-- Hotfix: restore notifications RLS and fix goal target notifications mapping

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notifications', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY notifications_select_scoped
ON public.notifications
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    target_user_id = auth.uid()
    OR (
      target_role IS NOT NULL
      AND UPPER(target_role) = public.app_current_user_role()
    )
    OR (
      directorate_id IS NOT NULL
      AND directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id()
    )
    OR public.app_current_user_role() = 'ADMIN'
  )
);

CREATE POLICY notifications_update_scoped
ON public.notifications
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    target_user_id = auth.uid()
    OR public.app_current_user_role() = 'ADMIN'
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    target_user_id = auth.uid()
    OR public.app_current_user_role() = 'ADMIN'
  )
);

CREATE POLICY notifications_delete_scoped
ON public.notifications
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    target_user_id = auth.uid()
    OR public.app_current_user_role() = 'ADMIN'
  )
);

CREATE POLICY notifications_insert_authenticated
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.app_current_user_role() = 'ADMIN'
    OR target_user_id IS NOT NULL
    OR target_role IS NOT NULL
    OR directorate_id IS NOT NULL
  )
);

CREATE OR REPLACE FUNCTION public.notify_new_goal()
RETURNS TRIGGER AS $$
DECLARE
  v_assignee_type text;
  v_notif_type text;
BEGIN
  v_assignee_type := lower(coalesce(NEW.assignee_type, ''));
  v_notif_type := CASE WHEN NEW.type = 'Missão' THEN 'missao' ELSE 'meta' END;

  IF v_assignee_type IN ('global', 'all') THEN
    INSERT INTO public.notifications (
      title, message, type, target_user_id, reference_id, reference_route
    )
    SELECT
      'Nova ' || NEW.type || ' Global: ' || NEW.title,
      'Objetivo: ' || COALESCE(NEW.target::text, ''),
      v_notif_type,
      id,
      NEW.id,
      '/admin'
    FROM public.profiles
    WHERE lower(coalesce(status, '')) IN ('active', 'ativo');

  ELSIF v_assignee_type IN ('directorate', 'diretoria') AND NEW.assignee_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      title, message, type, target_user_id, reference_id, reference_route
    )
    SELECT
      'Nova ' || NEW.type || ' para Diretoria: ' || NEW.title,
      'Objetivo: ' || COALESCE(NEW.target::text, ''),
      v_notif_type,
      id,
      NEW.id,
      '/admin'
    FROM public.profiles
    WHERE directorate_id::text = NEW.assignee_id::text
      AND lower(coalesce(status, '')) IN ('active', 'ativo');

  ELSIF v_assignee_type = 'team' AND NEW.assignee_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      title, message, type, target_user_id, reference_id, reference_route
    )
    SELECT
      'Nova ' || NEW.type || ' para Equipe: ' || NEW.title,
      'Objetivo: ' || COALESCE(NEW.target::text, ''),
      v_notif_type,
      id,
      NEW.id,
      '/admin'
    FROM public.profiles
    WHERE (
      team_id::text = NEW.assignee_id::text
      OR team = NEW.assignee_id::text
    )
      AND lower(coalesce(status, '')) IN ('active', 'ativo');

  ELSIF v_assignee_type IN ('individual', 'user') AND NEW.assignee_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      title, message, type, target_user_id, reference_id, reference_route
    ) VALUES (
      'Nova ' || NEW.type || ' Atribuida a Voce: ' || NEW.title,
      'Objetivo: ' || COALESCE(NEW.target::text, ''),
      v_notif_type,
      NEW.assignee_id,
      NEW.id,
      '/admin'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_new_goal ON public.goals;
CREATE TRIGGER trigger_notify_new_goal
AFTER INSERT ON public.goals
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_goal();
