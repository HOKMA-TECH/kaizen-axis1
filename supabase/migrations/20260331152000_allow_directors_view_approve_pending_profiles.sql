-- Hotfix: allow DIRETOR to see and approve pending profiles before directorate assignment

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_director_view_pending_inbox ON public.profiles;
CREATE POLICY profiles_director_view_pending_inbox
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.app_current_user_role() = 'DIRETOR'
  AND UPPER(COALESCE(status, '')) IN ('PENDING', 'PENDENTE')
  AND UPPER(COALESCE(role, '')) <> 'ADMIN'
  AND (
    directorate_id IS NULL
    OR directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id()
  )
);

DROP POLICY IF EXISTS profiles_director_approve_pending ON public.profiles;
CREATE POLICY profiles_director_approve_pending
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND public.app_current_user_role() = 'DIRETOR'
  AND UPPER(COALESCE(status, '')) IN ('PENDING', 'PENDENTE')
  AND UPPER(COALESCE(role, '')) <> 'ADMIN'
  AND (
    directorate_id IS NULL
    OR directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.app_current_user_role() = 'DIRETOR'
  AND UPPER(COALESCE(role, '')) <> 'ADMIN'
  AND directorate_id IS NOT DISTINCT FROM public.app_current_user_directorate_id()
);
