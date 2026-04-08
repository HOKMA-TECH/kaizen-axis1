ALTER TABLE public.client_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_history_select_scoped ON public.client_history;
DROP POLICY IF EXISTS client_history_insert_scoped ON public.client_history;

CREATE POLICY client_history_select_scoped
ON public.client_history
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_history.client_id
      AND public.app_user_in_scope(c.owner_id)
  )
);

CREATE POLICY client_history_insert_scoped
ON public.client_history
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = client_history.client_id
      AND public.app_user_in_scope(c.owner_id)
  )
);
