-- APP-06: JWT de pending/inactive não passa em tabelas de negócio.
CREATE OR REPLACE FUNCTION public.app_current_user_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND UPPER(COALESCE(p.status, '')) IN ('ACTIVE', 'ATIVO')
  );
$$;

REVOKE ALL ON FUNCTION public.app_current_user_is_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_current_user_is_active() TO authenticated, service_role;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients',
    'daily_checkins',
    'tasks',
    'appointments',
    'sales_mirrors',
    'commission_entries',
    'leads',
    'client_documents',
    'client_proponents'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS zz_active_profiles_only ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY zz_active_profiles_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.app_current_user_is_active()) WITH CHECK (public.app_current_user_is_active())',
        t
      );
    END IF;
  END LOOP;
END
$$;
